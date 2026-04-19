-- Complete cleanup function for a business and all its data
CREATE OR REPLACE FUNCTION public.hard_delete_business(p_biz_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Security check: Only platform admins can call this
    IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid() AND is_active = true) THEN
        RAISE EXCEPTION 'Access denied. Only platform administrators can delete businesses.';
    END IF;

    -- 2. Delete Audit Logs & Notifications (if any)
    -- (Skipped: audit_logs relation not uniformly available across all environments)

    -- 3. Delete Sales & Related
    DELETE FROM public.sale_payments WHERE business_id = p_biz_id;
    DELETE FROM public.sale_items WHERE business_id = p_biz_id;
    DELETE FROM public.sales WHERE business_id = p_biz_id;

    -- 4. Delete Purchases & Related
    DELETE FROM public.purchase_payments WHERE business_id = p_biz_id;
    DELETE FROM public.purchase_items WHERE business_id = p_biz_id;
    DELETE FROM public.purchases WHERE business_id = p_biz_id;

    -- 5. Delete Customer/Supplier Payments
    DELETE FROM public.customer_payments WHERE business_id = p_biz_id;

    -- 6. Delete Inventory & Stock
    DELETE FROM public.stock_movements WHERE business_id = p_biz_id;
    DELETE FROM public.stock_count_items WHERE business_id = p_biz_id;
    DELETE FROM public.stock_counts WHERE business_id = p_biz_id;
    DELETE FROM public.stock_transfer_items WHERE business_id = p_biz_id;
    DELETE FROM public.stock_transfers WHERE business_id = p_biz_id;
    DELETE FROM public.product_stocks WHERE business_id = p_biz_id;
    DELETE FROM public.products WHERE business_id = p_biz_id;
    DELETE FROM public.categories WHERE business_id = p_biz_id;

    -- 7. Delete Users & Access
    DELETE FROM public.user_permissions WHERE business_id = p_biz_id;
    DELETE FROM public.user_locations WHERE business_id = p_biz_id;
    DELETE FROM public.cash_registers WHERE business_id = p_biz_id;
    
    -- NOTE: We don't delete from auth.users directly as that requires 
    -- service_role rights or a more complex trigger, but we delete
    -- the public.users records which will block their app access.
    DELETE FROM public.users WHERE business_id = p_biz_id;

    -- 8. Delete Business Core
    DELETE FROM public.locations WHERE business_id = p_biz_id;
    DELETE FROM public.shop_settings WHERE business_id = p_biz_id;
    DELETE FROM public.suppliers WHERE business_id = p_biz_id;
    DELETE FROM public.customers WHERE business_id = p_biz_id;
    
    DELETE FROM public.businesses WHERE id = p_biz_id;
END;
$$;
