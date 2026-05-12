drop policy if exists "Staff delete products" on public.products;

create policy "Staff delete products"
on public.products
for delete
using (
  public.is_platform_admin()
  or (public.has_module_permission('Products', 'delete') and business_id = public.get_user_business_id())
);
