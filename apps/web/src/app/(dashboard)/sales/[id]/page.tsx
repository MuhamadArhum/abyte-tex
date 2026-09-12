"use client";

import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { Action, Resource } from "@abytetex/types";
import { useSalesOrder, useUpdateSalesOrderStatus } from "@/features/sales/hooks";
import { SALES_ORDER_STATUSES, type SalesOrderStatus } from "@/features/sales/api";
import { ArrowLeft, ChevronDown, Loader2 } from "lucide-react";

export default function SalesOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const can = useAuthStore((s) => s.can);
  const { data, isLoading } = useSalesOrder(params.id);
  const statusMutation = useUpdateSalesOrderStatus(params.id);

  if (isLoading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data?.data) return <p className="text-sm text-muted-foreground">Sales order not found.</p>;

  const o = data.data;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.push("/sales")}>
        <ArrowLeft className="h-4 w-4" /> Back to Sales Orders
      </Button>
      <PageHeader
        title={o.orderNumber}
        description={`Customer: ${o.customer.name}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={o.status} />
            {can(Resource.SALES_ORDER, Action.APPROVE) && (
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  Change status <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SALES_ORDER_STATUSES.filter((s) => s !== o.status).map((s: SalesOrderStatus) => (
                    <DropdownMenuItem key={s} onClick={() => statusMutation.mutate(s)}>
                      {s.replaceAll("_", " ")}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Unit price</TableHead>
                  <TableHead>Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.product.name} ({item.product.sku})</TableCell>
                    <TableCell>{item.quantity} {item.unit}</TableCell>
                    <TableCell>{item.deliveredQty}</TableCell>
                    <TableCell>{Number(item.unitPrice).toLocaleString()}</TableCell>
                    <TableCell>{Number(item.lineTotal).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{Number(o.subtotal).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>{Number(o.discount).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{Number(o.tax).toLocaleString()}</span></div>
            <div className="flex justify-between border-t pt-1.5 font-medium"><span>Total</span><span>{Number(o.total).toLocaleString()}</span></div>
            {o.notes && <p className="pt-2 text-muted-foreground">{o.notes}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
