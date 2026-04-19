import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  PackageSearch,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  roles?: AppRole[];
};

export type AppRole = "admin" | "manager" | "cashier";

export type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  barcode: string;
  image: string;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "POS", path: "/pos", icon: ShoppingCart },
  { label: "Products", path: "/products", icon: Boxes, roles: ["admin", "manager", "cashier"] },
  { label: "Sales", path: "/sales", icon: ReceiptText },
  {
    label: "Purchases",
    path: "/purchases",
    icon: ClipboardList,
    roles: ["admin", "manager"],
  },
  {
    label: "Customers",
    path: "/customers",
    icon: Users,
    roles: ["admin", "manager"],
  },
  {
    label: "Suppliers",
    path: "/suppliers",
    icon: Truck,
    roles: ["admin", "manager"],
  },
  { label: "Stock", path: "/stock", icon: PackageSearch, roles: ["admin", "manager"] },
  { label: "Reports", path: "/reports", icon: BarChart3, roles: ["admin", "manager"] },
  { label: "Settings", path: "/settings", icon: Settings, roles: ["admin"] },
  { label: "Subscription", path: "/subscription", icon: CreditCard, roles: ["admin"] },
];

export const dashboardStats = [
  { title: "Total Sales", value: "$2,400", meta: "+18% vs yesterday" },
  { title: "Revenue", value: "$18,000", meta: "This month" },
  { title: "Products Sold", value: "324", meta: "Across 42 orders" },
  { title: "Low Stock Alerts", value: "8 items", meta: "Restock needed" },
];

export const salesTrend = [
  { label: "Mon", value: 38 },
  { label: "Tue", value: 52 },
  { label: "Wed", value: 44 },
  { label: "Thu", value: 61 },
  { label: "Fri", value: 74 },
  { label: "Sat", value: 58 },
  { label: "Sun", value: 47 },
];

export const topProducts: Product[] = [
  {
    id: 1,
    name: "BlueBand Milk 1L",
    category: "Dairy",
    price: 3.2,
    stock: 18,
    barcode: "1002003001",
    image:
      "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=500&q=80",
  },
  {
    id: 2,
    name: "Golden Rice 5kg",
    category: "Groceries",
    price: 12.5,
    stock: 10,
    barcode: "1002003002",
    image:
      "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=500&q=80",
  },
  {
    id: 3,
    name: "Fresh Cola 500ml",
    category: "Beverages",
    price: 1.8,
    stock: 37,
    barcode: "1002003003",
    image:
      "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=500&q=80",
  },
  {
    id: 4,
    name: "Crunch Chips",
    category: "Snacks",
    price: 2.75,
    stock: 6,
    barcode: "1002003004",
    image:
      "https://images.unsplash.com/photo-1613919113640-25732ec5e61f?auto=format&fit=crop&w=500&q=80",
  },
];

export const cartItems = [
  { id: 1, name: "BlueBand Milk 1L", qty: 2, price: 3.2 },
  { id: 3, name: "Fresh Cola 500ml", qty: 3, price: 1.8 },
  { id: 4, name: "Crunch Chips", qty: 1, price: 2.75 },
];

export const recentTransactions = [
  { id: "INV-1029", customer: "Walk-in Customer", total: "$24.60", cashier: "Ama", time: "09:12" },
  { id: "INV-1028", customer: "Kwame Mensah", total: "$18.20", cashier: "Joseph", time: "08:47" },
  { id: "INV-1027", customer: "Grace Market", total: "$40.00", cashier: "Ama", time: "08:31" },
];

export const productsTable = [
  { name: "BlueBand Milk 1L", category: "Dairy", price: "$3.20", stock: 18, status: "In Stock" },
  { name: "Golden Rice 5kg", category: "Groceries", price: "$12.50", stock: 10, status: "In Stock" },
  { name: "Crunch Chips", category: "Snacks", price: "$2.75", stock: 6, status: "Low Stock" },
  { name: "Spark Soap", category: "Home Care", price: "$1.60", stock: 0, status: "Out of Stock" },
];

export const salesTable = [
  { sale: "INV-1029", customer: "Walk-in Customer", amount: "$24.60", status: "Paid", cashier: "Ama", date: "2026-04-09" },
  { sale: "INV-1028", customer: "Kwame Mensah", amount: "$18.20", status: "Paid", cashier: "Joseph", date: "2026-04-09" },
  { sale: "INV-1025", customer: "Akua Stores", amount: "$112.00", status: "Unpaid", cashier: "Ama", date: "2026-04-08" },
];

export const purchasesTable = [
  { supplier: "Prime Foods Ltd", product: "Golden Rice 5kg", quantity: 20, cost: "$190.00", date: "2026-04-07" },
  { supplier: "Cool Drinks Co", product: "Fresh Cola 500ml", quantity: 48, cost: "$54.00", date: "2026-04-06" },
  { supplier: "Daily Dairy", product: "BlueBand Milk 1L", quantity: 36, cost: "$82.00", date: "2026-04-05" },
];

export const customersTable = [
  { name: "Kwame Mensah", phone: "+233 20 111 2222", visits: 14, spent: "$280.00" },
  { name: "Grace Market", phone: "+233 24 444 8888", visits: 5, spent: "$94.00" },
  { name: "Walk-in Customer", phone: "N/A", visits: 67, spent: "$1,244.00" },
];

export const suppliersTable = [
  { name: "Prime Foods Ltd", contact: "Samuel Addo", phone: "+233 30 222 7777", purchases: "$2,800.00" },
  { name: "Cool Drinks Co", contact: "Elvis Boateng", phone: "+233 20 876 9999", purchases: "$1,340.00" },
  { name: "Daily Dairy", contact: "Ama Badu", phone: "+233 27 555 1111", purchases: "$950.00" },
];

export const stockMovements = [
  { item: "Golden Rice 5kg", type: "Stock In", quantity: "+20", location: "Supermarket", status: "Completed" },
  { item: "Crunch Chips", type: "Stock Out", quantity: "-12", location: "Front Shelf", status: "Completed" },
  { item: "Spark Soap", type: "Transfer", quantity: "15", location: "Store A to B", status: "Pending" },
];

export const reportCards = [
  { title: "Daily Sales", value: "$1,820", meta: "09:00 - 18:00" },
  { title: "Paid Sales", value: "$1,570", meta: "86% of total" },
  { title: "Unpaid Sales", value: "$250", meta: "7 invoices" },
  { title: "Best Cashier", value: "Ama", meta: "17 sales closed" },
];

export const settingsSections = [
  {
    title: "User Management",
    items: ["Create cashier accounts", "Assign admin or manager roles", "Audit sign-in activity"],
  },
  {
    title: "Shop Settings",
    items: ["Update shop name and logo", "Choose default currency", "Configure receipt footer"],
  },
  {
    title: "Payment & Tax",
    items: ["Cash, card and MoMo setup", "Tax rate rules", "Payment reconciliation"],
  },
  {
    title: "Backup & Restore",
    items: ["Manual backup trigger", "Restore last snapshot", "Data retention policy"],
  },
];

export const paymentMethods = [
  { label: "Cash", icon: CreditCard },
  { label: "MoMo", icon: CreditCard },
  { label: "Card", icon: CreditCard },
];
