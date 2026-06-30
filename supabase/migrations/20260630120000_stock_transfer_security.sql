-- Tighten stock transfer visibility and status workflow.
-- Users can see transfers only when they belong to the source or destination branch.
-- Creators can edit open transfers, but a different receiving/source branch user must complete them.

create index if not exists idx_stock_transfers_from_location_created
on public.stock_transfers(from_location_id, created_at desc);

create index if not exists idx_stock_transfers_to_location_created
on public.stock_transfers(to_location_id, created_at desc);

create index if not exists idx_stock_transfers_open_creator
on public.stock_transfers(created_by, status)
where status <> 'completed';

create index if not exists idx_sales_credit_age
on public.sales(payment_status, created_at)
where payment_status <> 'paid';

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'supplier_payment_schedules'
  ) then
    create index if not exists idx_supplier_schedules_status_due
    on public.supplier_payment_schedules(status, due_date);
  end if;
end;
$$;

create or replace function public.user_has_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    left join public.user_locations ul
      on ul.user_id = u.id
      and ul.location_id = p_location_id
    where u.auth_user_id = auth.uid()
      and u.business_id = public.get_user_business_id()
      and (
        public.is_platform_admin()
        or u.role = 'admin'
        or u.location_id = p_location_id
        or ul.user_id is not null
      )
  );
$$;

create or replace function public.get_current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.user_can_access_transfer(p_transfer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stock_transfers st
    where st.id = p_transfer_id
      and st.business_id = public.get_user_business_id()
      and (
        public.is_platform_admin()
        or public.user_has_location(st.from_location_id)
        or public.user_has_location(st.to_location_id)
      )
  );
$$;

drop policy if exists "Staff read stock transfers" on public.stock_transfers;
create policy "Staff read stock transfers"
on public.stock_transfers
for select
using (
  public.is_platform_admin()
  or (
    public.has_module_permission('Stock', 'view')
    and business_id = public.get_user_business_id()
    and (
      public.user_has_location(from_location_id)
      or public.user_has_location(to_location_id)
    )
  )
);

drop policy if exists "Staff insert stock transfers" on public.stock_transfers;
create policy "Staff insert stock transfers"
on public.stock_transfers
for insert
with check (
  public.is_platform_admin()
  or (
    public.has_module_permission('Stock', 'add')
    and business_id = public.get_user_business_id()
    and public.user_has_location(from_location_id)
    and status <> 'completed'
  )
);

drop policy if exists "Staff update stock transfers" on public.stock_transfers;
create policy "Staff update stock transfers"
on public.stock_transfers
for update
using (
  public.is_platform_admin()
  or (
    public.has_module_permission('Stock', 'edit')
    and business_id = public.get_user_business_id()
    and status <> 'completed'
    and (
      created_by = public.get_current_user_id()
      or (
        public.user_has_location(to_location_id)
        and created_by <> public.get_current_user_id()
      )
    )
  )
)
with check (
  public.is_platform_admin()
  or (
    public.has_module_permission('Stock', 'edit')
    and business_id = public.get_user_business_id()
    and (
      (
        created_by = public.get_current_user_id()
        and status <> 'completed'
        and public.user_has_location(from_location_id)
      )
      or (
        created_by <> public.get_current_user_id()
        and status = 'completed'
        and public.user_has_location(to_location_id)
      )
    )
  )
);

drop policy if exists "Staff delete stock transfers" on public.stock_transfers;
create policy "Staff delete stock transfers"
on public.stock_transfers
for delete
using (
  public.is_platform_admin()
  or (
    public.has_module_permission('Stock', 'delete')
    and business_id = public.get_user_business_id()
    and status <> 'completed'
    and created_by = public.get_current_user_id()
  )
);

drop policy if exists "Staff read stock transfer items" on public.stock_transfer_items;
create policy "Staff read stock transfer items"
on public.stock_transfer_items
for select
using (
  public.is_platform_admin()
  or (
    public.has_module_permission('Stock', 'view')
    and business_id = public.get_user_business_id()
    and public.user_can_access_transfer(stock_transfer_id)
  )
);

drop policy if exists "Staff manage stock transfer items" on public.stock_transfer_items;
create policy "Staff manage stock transfer items"
on public.stock_transfer_items
for all
using (
  public.is_platform_admin()
  or (
    public.has_module_permission('Stock', 'edit')
    and business_id = public.get_user_business_id()
    and exists (
      select 1
      from public.stock_transfers st
      where st.id = stock_transfer_id
        and st.business_id = public.get_user_business_id()
        and st.status <> 'completed'
        and st.created_by = public.get_current_user_id()
        and public.user_has_location(st.from_location_id)
    )
  )
)
with check (
  public.is_platform_admin()
  or (
    public.has_module_permission('Stock', 'add')
    and business_id = public.get_user_business_id()
    and exists (
      select 1
      from public.stock_transfers st
      where st.id = stock_transfer_id
        and st.business_id = public.get_user_business_id()
        and st.status <> 'completed'
        and st.created_by = public.get_current_user_id()
        and public.user_has_location(st.from_location_id)
    )
  )
);

create or replace function public.update_stock_transfer_status(
  p_transfer_id uuid,
  p_new_status public.transfer_status,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status public.transfer_status;
  v_item record;
  v_from_loc uuid;
  v_to_loc uuid;
  v_business_id uuid;
  v_created_by uuid;
begin
  select business_id, status, from_location_id, to_location_id, created_by
  into v_business_id, v_old_status, v_from_loc, v_to_loc, v_created_by
  from public.stock_transfers
  where id = p_transfer_id;

  if v_business_id is null then
    raise exception 'Transfer not found.';
  end if;

  if v_old_status = 'completed' then
    raise exception 'Completed transfers cannot be changed.';
  end if;

  if p_new_status = 'completed' and v_created_by = p_user_id then
    raise exception 'The creator of a transfer cannot complete it.';
  end if;

  if p_new_status = 'completed' and not public.user_has_location(v_to_loc) then
    raise exception 'Only a user assigned to the receiving location can complete this transfer.';
  end if;

  if p_new_status = 'completed' and v_old_status != 'completed' then
    for v_item in
      select product_id, transfer_quantity
      from public.stock_transfer_items
      where stock_transfer_id = p_transfer_id
    loop
      update public.product_stocks
      set quantity = quantity - v_item.transfer_quantity
      where product_id = v_item.product_id
        and location_id = v_from_loc
        and business_id = v_business_id;

      insert into public.product_stocks (business_id, product_id, location_id, quantity)
      values (v_business_id, v_item.product_id, v_to_loc, v_item.transfer_quantity)
      on conflict (product_id, location_id)
      do update set quantity = public.product_stocks.quantity + excluded.quantity;

      update public.products p
      set stock_quantity = (
        select coalesce(sum(quantity), 0)
        from public.product_stocks
        where product_id = p.id
      )
      where id = v_item.product_id
        and business_id = v_business_id;

      insert into public.stock_movements (business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, reference_id)
      values (v_business_id, v_item.product_id, p_user_id, 'transfer', -v_item.transfer_quantity, v_from_loc, 'stock_transfer', p_transfer_id);

      insert into public.stock_movements (business_id, product_id, user_id, movement_type, quantity, destination_location_id, reference_type, reference_id)
      values (v_business_id, v_item.product_id, p_user_id, 'transfer', v_item.transfer_quantity, v_to_loc, 'stock_transfer', p_transfer_id);
    end loop;

    update public.stock_transfers set completed_at = now() where id = p_transfer_id;
  end if;

  update public.stock_transfers set status = p_new_status where id = p_transfer_id;
end;
$$;
