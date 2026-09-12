"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/auth-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { Action, Resource } from "@abytetex/types";
import { Package, Boxes, Users2, Truck, Factory, ArrowRight } from "lucide-react";

const QUICK_LINKS = [
  { label: "Products", href: "/products", icon: Package, requires: { resource: Resource.PRODUCT, action: Action.VIEW } },
  { label: "Materials", href: "/materials", icon: Boxes, requires: { resource: Resource.MATERIAL, action: Action.VIEW } },
  { label: "Customers", href: "/customers", icon: Users2, requires: { resource: Resource.CUSTOMER, action: Action.VIEW } },
  { label: "Suppliers", href: "/suppliers", icon: Truck, requires: { resource: Resource.SUPPLIER, action: Action.VIEW } },
  { label: "Factories", href: "/factories", icon: Factory, requires: { resource: Resource.FACTORY, action: Action.VIEW } },
];

export default function DashboardHomePage() {
  const session = useAuthStore((s) => s.session);
  const can = useAuthStore((s) => s.can);
  const isPlatformAdmin = session?.isPlatformAdmin ?? false;

  if (isPlatformAdmin) {
    return (
      <div>
        <PageHeader title="Platform Console" description="AbyteSol platform administration" />
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Manage tenants</CardTitle>
            <CardDescription>Provision new textile businesses onto AbyteTex.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/tenants" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Go to Tenants <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const links = QUICK_LINKS.filter((l) => can(l.requires.resource, l.requires.action));

  return (
    <div>
      <PageHeader
        title={`Welcome, ${session?.firstName ?? ""}`}
        description="Here's a quick jump-off point for your workspace."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href}>
              <Card className="transition-colors hover:border-primary/50 hover:bg-accent/40">
                <CardContent className="flex items-center gap-3 pt-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{link.label}</p>
                    <p className="text-xs text-muted-foreground">Manage {link.label.toLowerCase()}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {links.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Your role doesn&apos;t have access to any modules yet. Contact your administrator if this looks wrong.
          </p>
        )}
      </div>
    </div>
  );
}
