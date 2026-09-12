import { useQuery } from "@tanstack/react-query";
import {
  getInventoryDashboard,
  getMachineDashboard,
  getMaintenanceDashboard,
  getOwnerDashboard,
  getProductionDashboard,
  getQualityDashboard,
} from "./api";

export const useOwnerDashboard = () => useQuery({ queryKey: ["dashboard-owner"], queryFn: getOwnerDashboard });
export const useProductionDashboard = () => useQuery({ queryKey: ["dashboard-production"], queryFn: getProductionDashboard });
export const useMachineDashboard = () => useQuery({ queryKey: ["dashboard-machines"], queryFn: getMachineDashboard });
export const useInventoryDashboard = () => useQuery({ queryKey: ["dashboard-inventory"], queryFn: getInventoryDashboard });
export const useQualityDashboard = () => useQuery({ queryKey: ["dashboard-quality"], queryFn: getQualityDashboard });
export const useMaintenanceDashboard = () => useQuery({ queryKey: ["dashboard-maintenance"], queryFn: getMaintenanceDashboard });
