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
    label: "Master Data",
    items: [
      { label: "Products", href: "/products", icon: Package, requires: { resource: Resource.PRODUCT, action: Action.VIEW } },
      { label: "Materials", href: "/materials", icon: Boxes, requires: { resource: Resource.MATERIAL, action: Action.VIEW } },
      { label: "Customers", href: "/customers", icon: Users2, requires: { resource: Resource.CUSTOMER, action: Action.VIEW } },
      { label: "Suppliers", href: "/suppliers", icon: Truck, requires: { resource: Resource.SUPPLIER, action: Action.VIEW } },
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
