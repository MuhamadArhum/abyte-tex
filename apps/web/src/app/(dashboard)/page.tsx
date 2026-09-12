"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/auth-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Action, Resource } from "@abytetex/types";
import {
  useInventoryDashboard,
  useMachineDashboard,
  useMaintenanceDashboard,
  useOwnerDashboard,
  useProductionDashboard,
  useQualityDashboard,
} from "@/features/dashboards/hooks";
import {
  Package,
  Boxes,
  Users2,
  Truck,
  Factory,
  ArrowRight,
  TrendingUp,
  ShoppingCart,
  Warehouse,
  AlertTriangle,
  Wrench,
  ShieldCheck,
} from "lucide-react";

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
  const canViewReports = can(Resource.REPORT, Action.VIEW);

  return (
    <div>
      <PageHeader title={`Welcome, ${session?.firstName ?? ""}`} description="Here's what's happening across your operations." />

      {canViewReports ? (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="production">Production</TabsTrigger>
            <TabsTrigger value="machines">Machines</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="quality">Quality</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OwnerTab />
          </TabsContent>
          <TabsContent value="production" className="mt-4">
            <ProductionTab />
          </TabsContent>
          <TabsContent value="machines" className="mt-4">
            <MachinesTab />
          </TabsContent>
          <TabsContent value="inventory" className="mt-4">
            <InventoryTab />
          </TabsContent>
          <TabsContent value="quality" className="mt-4">
            <QualityTab />
          </TabsContent>
          <TabsContent value="maintenance" className="mt-4">
            <MaintenanceTab />
          </TabsContent>
        </Tabs>
      ) : null}

      {links.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick links</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}>
                  <Card className="transition-colors hover:border-primary/50 hover:bg-accent/40">
                    <CardContent className="flex items-center gap-3 pt-6">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="font-medium">{link.label}</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function OwnerTab() {
  const { data, isLoading } = useOwnerDashboard();
  const d = data?.data;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Production today" value={d?.productionToday ?? 0} icon={TrendingUp} isLoading={isLoading} />
      <StatCard label="Production this month" value={d?.productionThisMonth ?? 0} icon={TrendingUp} isLoading={isLoading} />
      <StatCard label="Pending sales orders" value={d?.pendingSalesOrders ?? 0} icon={ShoppingCart} isLoading={isLoading} />
      <StatCard label="Sales this month" value={d ? `Rs ${Number(d.salesThisMonth).toLocaleString()}` : "—"} icon={ShoppingCart} isLoading={isLoading} />
      <StatCard label="Total stock (units)" value={d?.totalStockUnits ?? 0} icon={Warehouse} isLoading={isLoading} />
      <StatCard label="Wastage this month" value={d?.wastageThisMonth ?? 0} icon={AlertTriangle} isLoading={isLoading} />
      {d && (
        <Card className="sm:col-span-2 lg:col-span-4">
          <CardContent className="pt-6">
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Machine status</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(d.machineStatusCounts).map(([status, count]) => (
                <Badge key={status} variant="secondary">
                  {status}: {count}
                </Badge>
              ))}
              {Object.keys(d.machineStatusCounts).length === 0 && <p className="text-sm text-muted-foreground">No machines configured yet.</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProductionTab() {
  const { data, isLoading } = useProductionDashboard();
  const d = data?.data;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Work in progress orders" value={d?.workInProgressOrders ?? 0} icon={Factory} isLoading={isLoading} />
      <StatCard label="Total output" value={d?.totalOutput ?? 0} icon={TrendingUp} isLoading={isLoading} />
      <StatCard label="Total wastage" value={d?.totalWastage ?? 0} icon={AlertTriangle} isLoading={isLoading} />
      <StatCard label="Delayed orders" value={d?.delayedOrders ?? 0} icon={AlertTriangle} isLoading={isLoading} />
      {d && (
        <Card className="sm:col-span-2 lg:col-span-4">
          <CardContent className="pt-6">
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Orders by status</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(d.ordersByStatus).map(([status, count]) => (
                <Badge key={status} variant="secondary">
                  {status.replaceAll("_", " ")}: {count}
                </Badge>
              ))}
              {Object.keys(d.ordersByStatus).length === 0 && <p className="text-sm text-muted-foreground">No production orders yet.</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MachinesTab() {
  const { data, isLoading } = useMachineDashboard();
  const d = data?.data;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Downtime this month (min)" value={d?.totalDowntimeMinutesThisMonth ?? 0} icon={AlertTriangle} isLoading={isLoading} />
      {d &&
        Object.entries(d.statusCounts).map(([status, count]) => (
          <StatCard key={status} label={status} value={count} icon={Factory} />
        ))}
    </div>
  );
}

function InventoryTab() {
  const { data, isLoading } = useInventoryDashboard();
  const d = data?.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Finished goods (units)" value={d?.totalFinishedGoodsUnits ?? 0} icon={Package} isLoading={isLoading} />
        <StatCard label="Raw material (units)" value={d?.totalRawMaterialUnits ?? 0} icon={Boxes} isLoading={isLoading} />
        <StatCard label="Movements this month" value={d?.movementsThisMonth ?? 0} icon={Warehouse} isLoading={isLoading} />
        <StatCard label="Low-stock materials" value={d?.lowStockMaterials.length ?? 0} icon={AlertTriangle} isLoading={isLoading} />
      </div>
      {d && d.lowStockMaterials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Low stock alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {d.lowStockMaterials.map((m) => (
              <div key={m.id} className="flex justify-between text-sm">
                <span>
                  {m.name} ({m.code})
                </span>
                <span className="text-destructive">
                  {m.onHand} / {m.reorderLevel} reorder level
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QualityTab() {
  const { data, isLoading } = useQualityDashboard();
  const d = data?.data;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total inspections" value={d?.totalInspections ?? 0} icon={ShieldCheck} isLoading={isLoading} />
      <StatCard label="Rejection rate" value={d ? `${d.rejectionRatePct}%` : "—"} icon={AlertTriangle} isLoading={isLoading} />
      {d &&
        Object.entries(d.outcomeCounts).map(([outcome, count]) => <StatCard key={outcome} label={outcome} value={count} icon={ShieldCheck} />)}
    </div>
  );
}

function MaintenanceTab() {
  const { data, isLoading } = useMaintenanceDashboard();
  const d = data?.data;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Open jobs" value={d?.openJobs ?? 0} icon={Wrench} isLoading={isLoading} />
      <StatCard label="Breakdown machines" value={d?.breakdownMachines ?? 0} icon={AlertTriangle} isLoading={isLoading} />
      <StatCard label="Cost this month" value={d ? `Rs ${Number(d.maintenanceCostThisMonth).toLocaleString()}` : "—"} icon={Wrench} isLoading={isLoading} />
      <StatCard label="Preventive due soon" value={d?.preventiveMaintenanceDueSoon ?? 0} icon={AlertTriangle} isLoading={isLoading} />
    </div>
  );
}
