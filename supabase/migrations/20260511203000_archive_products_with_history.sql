drop policy if exists "Staff update products" on public.products;

create policy "Staff update products"
on public.products
for update
using (
  public.is_platform_admin()
  or (
    business_id = public.get_user_business_id()
    and (
      public.has_module_permission('Products', 'edit')
      or public.has_module_permission('Products', 'delete')
    )
  )
)
with check (
  public.is_platform_admin()
  or (
    business_id = public.get_user_business_id()
    and (
      public.has_module_permission('Products', 'edit')
      or public.has_module_permission('Products', 'delete')
    )
  )
);

create or replace function public.archive_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id
  from public.products
  where id = p_product_id;

  if v_business_id is null then
    raise exception 'Product not found';
  end if;

  if not (
    public.is_platform_admin()
    or (
      public.has_module_permission('Products', 'delete')
      and v_business_id = public.get_user_business_id()
    )
  ) then
    raise exception 'Access denied. You do not have permission to delete products.';
  end if;

  update public.products
  set is_active = false
  where id = p_product_id
    and business_id = v_business_id;
end;
$$;
