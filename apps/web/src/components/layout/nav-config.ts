import { Action, Resource } from "@abytetex/types";
import {
  LayoutDashboard,
  Factory,
  Package,
  Boxes,
  Users2,
  Truck,
  ShieldCheck,
  UserCog,
  Building2,
  ShoppingCart,
  ClipboardList,
  Cog,
  Warehouse,
  Send,
  ShieldCheck as QualityIcon,
  Wrench,
  UserSquare2,
  CalendarCheck,
  AlertTriangle,
  Calculator,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Omit to always show (e.g. Dashboard, Company Settings) to any tenant user. */
  requires?: { resource: Resource; action: Action };
  /** Only ever shown to platform admins, never to tenant users. */
  platformOnly?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "",
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Commercial",
    items: [
      { label: "Sales Orders", href: "/sales", icon: ShoppingCart, requires: { resource: Resource.SALES_ORDER, action: Action.VIEW } },
      { label: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList, requires: { resource: Resource.PURCHASE_ORDER, action: Action.VIEW } },
      { label: "Dispatches", href: "/dispatches", icon: Send, requires: { resource: Resource.DISPATCH, action: Action.VIEW } },
    ],
  },
  {
    label: "Production",
    items: [
      { label: "Production Orders", href: "/production-orders", icon: Cog, requires: { resource: Resource.PRODUCTION_ORDER, action: Action.VIEW } },
      { label: "Machines & Looms", href: "/machines", icon: Factory, requires: { resource: Resource.MACHINE, action: Action.VIEW } },
      { label: "Quality", href: "/quality", icon: QualityIcon, requires: { resource: Resource.QUALITY_INSPECTION, action: Action.VIEW } },
      { label: "Maintenance", href: "/maintenance", icon: Wrench, requires: { resource: Resource.MAINTENANCE_JOB, action: Action.VIEW } },
      { label: "Downtime", href: "/downtime", icon: AlertTriangle, requires: { resource: Resource.DOWNTIME, action: Action.VIEW } },
      { label: "Costing", href: "/costing", icon: Calculator, requires: { resource: Resource.COST_SHEET, action: Action.VIEW } },
    ],
  },
  {
    label: "Inventory",
    items: [{ label: "Stock & Movements", href: "/inventory", icon: Warehouse, requires: { resource: Resource.STOCK, action: Action.VIEW } }],
  },
  {
    label: "Master Data",
    items: [
      { label: "Products", href: "/products", icon: Package, requires: { resource: Resource.PRODUCT, action: Action.VIEW } },
      { label: "Materials", href: "/materials", icon: Boxes, requires: { resource: Resource.MATERIAL, action: Action.VIEW } },
      { label: "Customers", href: "/customers", icon: Users2, requires: { resource: Resource.CUSTOMER, action: Action.VIEW } },
      { label: "Suppliers", href: "/suppliers", icon: Truck, requires: { resource: Resource.SUPPLIER, action: Action.VIEW } },
    ],
  },
  {
    label: "HR",
    items: [
      { label: "Employees", href: "/employees", icon: UserSquare2, requires: { resource: Resource.EMPLOYEE, action: Action.VIEW } },
      { label: "Attendance", href: "/attendance", icon: CalendarCheck, requires: { resource: Resource.ATTENDANCE, action: Action.VIEW } },
      { label: "Payroll", href: "/payroll", icon: Wallet, requires: { resource: Resource.PAYROLL, action: Action.VIEW } },
    ],
  },
  {
    label: "Factory Setup",
    items: [{ label: "Factories", href: "/factories", icon: Factory, requires: { resource: Resource.FACTORY, action: Action.VIEW } }],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/users", icon: UserCog, requires: { resource: Resource.USER, action: Action.VIEW } },
      { label: "Roles & Permissions", href: "/roles", icon: ShieldCheck, requires: { resource: Resource.ROLE, action: Action.VIEW } },
      { label: "Company Settings", href: "/settings/company", icon: Building2, requires: { resource: Resource.TENANT, action: Action.VIEW } },
    ],
  },
  {
    label: "Platform",
    items: [{ label: "Tenants", href: "/tenants", icon: Building2, platformOnly: true }],
  },
];
