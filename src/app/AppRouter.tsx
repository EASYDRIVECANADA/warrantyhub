import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { ProtectedRouteV2 } from "../components/auth/ProtectedRouteV2";
import { RootLayout } from "../layouts/RootLayout";
import { AdminDashboardPage } from "../pages/AdminDashboardPage";
import { AdminUsersPage } from "../pages/AdminUsersPage";
import { AdminAccessRequestsPage } from "../pages/AdminAccessRequestsPage";
import { AdminProvidersPage } from "../pages/AdminProvidersPage";
import { AuditLogsPage } from "../pages/AuditLogsPage";
import { DealerContractDetailPage } from "../pages/DealerContractDetailPage";
import { DealerContractPrintPage } from "../pages/DealerContractPrintPage";
import { DealerContractsPage } from "../pages/DealerContractsPage";
import { DealerAdminPage } from "../pages/DealerAdminPage";
import { DealerAdminContractsPage } from "../pages/DealerAdminContractsPage";
import { DealerRemittanceBatchPrintPage } from "../pages/DealerRemittanceBatchPrintPage";
import { DealerRemittancesPage } from "../pages/DealerRemittancesPage";
import { DealerDashboardPage } from "../pages/DealerDashboardPage";
import { DealerTeamPage } from "../pages/DealerTeamPage";
import { DealerReportingPage } from "../pages/DealerReportingPage";
import { DealerConfigurePage } from "../pages/DealerConfigurePage";
import { DealerSubscriptionRoute } from "../components/DealerSubscriptionRoute";
import { DealerBillingPage } from "../pages/DealerBillingPage";
import { DealerBillingSuccessPage } from "../pages/DealerBillingSuccessPage";
import { DealerBillingCancelPage } from "../pages/DealerBillingCancelPage";
import { DealerPaymentsPage } from "../pages/DealerPaymentsPage";
import { HomePage } from "../pages/HomePage";
import { RegisterDealershipPage } from "../pages/RegisterDealershipPage";
import { DealerEmployeeSignupPage } from "../pages/DealerEmployeeSignupPage";
import { ProviderContractDetailPage } from "../pages/ProviderContractDetailPage";
import { ProviderContractPrintPage } from "../pages/ProviderContractPrintPage";
import { ProviderRemittancePrintPage } from "../pages/ProviderRemittancePrintPage";
import { SignInPage } from "../pages/SignInPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { SuperAdminPlatformPage } from "../pages/SuperAdminPlatformPage";
import { SuperAdminCompaniesPage } from "../pages/SuperAdminCompaniesPage";
import { AdminDealershipsPage } from "../pages/AdminDealershipsPage";
import { RequestAccessPage } from "../pages/RequestAccessPage";
import { ProfilePage } from "../pages/ProfilePage";
import { RemittancesPage } from "../pages/RemittancesPage";
import { SupportPage } from "../pages/SupportPage";
import { AdminSupportInboxPage } from "../pages/AdminSupportInboxPage";

// --- New V2 stub pages ---
import AdminOverviewPage from "../pages/admin/AdminOverviewPage";
import AdminDealershipsPage2 from "../pages/admin/AdminDealershipsPage2";
import AdminProvidersPage2 from "../pages/admin/AdminProvidersPage2";
import AdminUsersPage2 from "../pages/admin/AdminUsersPage2";
import AdminContractsPage from "../pages/admin/AdminContractsPage";

import ProviderOverviewPage from "../pages/provider/ProviderOverviewPage";
import ProviderProductsPage2 from "../pages/provider/ProviderProductsPage2";
import ProviderProductEditorPage from "../pages/provider/ProviderProductEditorPage";
import ProviderContractsPage2 from "../pages/provider/ProviderContractsPage2";
import ProviderRemittancesPage2 from "../pages/provider/ProviderRemittancesPage2";
import ProviderAnalyticsPage from "../pages/provider/ProviderAnalyticsPage";
import ProviderSettingsPage from "../pages/provider/ProviderSettingsPage";

import DealershipOverviewPage from "../pages/dealership/DealershipOverviewPage";
import FindProductsPage from "../pages/dealership/FindProductsPage";
import DealershipContractsPage from "../pages/dealership/DealershipContractsPage";
import NewContractPage from "../pages/dealership/NewContractPage";
import ContractDetailPage from "../pages/dealership/ContractDetailPage";
import DealershipRemittancesPage from "../pages/dealership/DealershipRemittancesPage";
import DealershipComparePlansPage from "../pages/dealership/DealershipComparePlansPage";
import ProductCoveragePage from "../pages/dealership/ProductCoveragePage";
import DealershipTireRimPage from "../pages/dealership/DealershipTireRimPage";
import DealershipReportingPage from "../pages/dealership/DealershipReportingPage";
import DealershipProfilePage from "../pages/dealership/settings/ProfilePage";
import DealershipTeamManagementPage from "../pages/dealership/settings/TeamManagementPage";
import DealershipConfigurationPage from "../pages/dealership/settings/ConfigurationPage";

// --- Brochure pages (public) ---
import BrochurePage from "../pages/brochure/BrochurePage";
import BrochureComparePage from "../pages/brochure/BrochureComparePage";
import BrochureTireRimPage from "../pages/brochure/BrochureTireRimPage";
import BrochureProductDetailPage from "../pages/brochure/BrochureProductDetailPage";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Navigate to="/find-insurance" replace />} />
        <Route path="find-insurance" element={<HomePage />} />

        <Route path="register-dealership" element={<RegisterDealershipPage />} />
        <Route path="dealer-employee-signup" element={<DealerEmployeeSignupPage />} />

        <Route path="sign-in" element={<SignInPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="get-started" element={<Navigate to="/register-dealership" replace />} />

        <Route path="login" element={<Navigate to="/sign-in" replace />} />
        <Route element={<ProtectedRoute />}>
          <Route path="request-access" element={<RequestAccessPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* Support — accessible to dealers, employees, and providers */}
        <Route element={<ProtectedRoute allowedRoles={["DEALER_ADMIN", "DEALER_EMPLOYEE", "PROVIDER"]} />}>
          <Route path="support" element={<SupportPage />} />
        </Route>

        {/* ===== OLD admin routes (kept for backward compatibility) ===== */}
        <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
          <Route path="company-dashboard" element={<AdminDashboardPage />} />
          <Route path="admin-remittances" element={<RemittancesPage title="Admin Remittances" />} />
          <Route path="admin-support" element={<AdminSupportInboxPage />} />
          <Route path="admin-providers" element={<AdminProvidersPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["SUPER_ADMIN"]} />}>
          <Route path="platform" element={<SuperAdminPlatformPage />} />
          <Route path="admin-access-requests" element={<AdminAccessRequestsPage />} />
          <Route path="admin-companies" element={<SuperAdminCompaniesPage />} />
          <Route path="admin-dealerships" element={<AdminDealershipsPage />} />
          <Route path="admin-users" element={<AdminUsersPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
        </Route>

        {/* ===== OLD dealer routes (kept for backward compatibility) ===== */}
        <Route element={<ProtectedRoute allowedRoles={["DEALER_ADMIN", "DEALER_EMPLOYEE"]} />}>
          <Route path="dealer-billing" element={<DealerBillingPage />} />
          <Route path="dealer-billing/success" element={<DealerBillingSuccessPage />} />
          <Route path="dealer-billing/cancel" element={<DealerBillingCancelPage />} />
          <Route path="dealer-payments" element={<DealerPaymentsPage />} />
        </Route>

        <Route element={<DealerSubscriptionRoute />}>
          <Route element={<ProtectedRoute allowedRoles={["DEALER_ADMIN"]} />}>
            <Route path="dealer-admin" element={<DealerAdminPage />} />
            <Route path="dealer-contracts-admin" element={<DealerAdminContractsPage />} />
            <Route path="dealer-employees" element={<DealerTeamPage />} />
            <Route path="dealer-team" element={<DealerTeamPage />} />
            <Route path="dealer-configure" element={<DealerConfigurePage />} />
            <Route path="dealer-reporting" element={<DealerReportingPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["DEALER_ADMIN", "DEALER_EMPLOYEE"]} />}>
            <Route path="dealer-dashboard" element={<DealerDashboardPage />} />
            <Route path="dealer-marketplace" element={<Navigate to="/dealership/find-products" replace />} />
            <Route path="dealer-marketplace/compare" element={<Navigate to="/dealership/compare" replace />} />
            <Route path="dealer-marketplace/products/:id" element={<Navigate to="/dealership/find-products" replace />} />
            <Route path="dealer-contracts" element={<DealerContractsPage />} />
            <Route path="dealer-contracts/:id" element={<DealerContractDetailPage />} />
            <Route path="dealer-contracts/:id/print/:copyType" element={<DealerContractPrintPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["DEALER_ADMIN"]} />}>
            <Route path="dealer-remittances" element={<DealerRemittancesPage />} />
            <Route path="dealer-remittances/batches/:id/print" element={<DealerRemittanceBatchPrintPage />} />
          </Route>
        </Route>

        {/* ===== OLD provider routes — redirect to new /provider/* structure ===== */}
        <Route path="provider-dashboard" element={<Navigate to="/provider/overview" replace />} />
        <Route path="provider-products" element={<Navigate to="/provider/products" replace />} />
        <Route path="provider-terms" element={<Navigate to="/provider/settings" replace />} />
        <Route path="provider-contracts" element={<Navigate to="/provider/contracts" replace />} />
        <Route path="provider-remittances" element={<Navigate to="/provider/remittances" replace />} />
        <Route path="provider-documents" element={<Navigate to="/provider/settings" replace />} />
        {/* Keep print routes on old pages (no new equivalent yet) */}
        <Route element={<ProtectedRoute allowedRoles={["PROVIDER"]} />}>
          <Route path="provider-contracts/:id" element={<ProviderContractDetailPage />} />
          <Route path="provider-contracts/:id/print" element={<ProviderContractPrintPage />} />
          <Route path="provider-remittances/:id/print" element={<ProviderRemittancePrintPage />} />
        </Route>
      </Route>

      {/* ===================================================================
          NEW V2 routes — /admin/*, /provider/*, /dealership/*
          These use ProtectedRouteV2 (wraps children, not Outlet) and
          DashboardLayout (own sidebar, no RootLayout needed).
          =================================================================== */}

      {/* --- Admin routes --- */}
      <Route
        path="/admin/overview"
        element={
          <ProtectedRouteV2 allowedRoles={["super_admin"]}>
            <AdminOverviewPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/admin/dealerships"
        element={
          <ProtectedRouteV2 allowedRoles={["super_admin"]}>
            <AdminDealershipsPage2 />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/admin/providers"
        element={
          <ProtectedRouteV2 allowedRoles={["super_admin"]}>
            <AdminProvidersPage2 />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRouteV2 allowedRoles={["super_admin"]}>
            <AdminUsersPage2 />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/admin/contracts"
        element={
          <ProtectedRouteV2 allowedRoles={["super_admin"]}>
            <AdminContractsPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRouteV2 allowedRoles={["super_admin"]}>
            <Navigate to="/admin/overview" replace />
          </ProtectedRouteV2>
        }
      />

      {/* --- Provider routes --- */}
      <Route
        path="/provider/overview"
        element={
          <ProtectedRouteV2 allowedRoles={["provider"]}>
            <ProviderOverviewPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/provider/products"
        element={
          <ProtectedRouteV2 allowedRoles={["provider"]}>
            <ProviderProductsPage2 />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/provider/products/new"
        element={
          <ProtectedRouteV2 allowedRoles={["provider"]}>
            <ProviderProductEditorPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/provider/products/:id"
        element={
          <ProtectedRouteV2 allowedRoles={["provider"]}>
            <ProviderProductEditorPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/provider/contracts"
        element={
          <ProtectedRouteV2 allowedRoles={["provider"]}>
            <ProviderContractsPage2 />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/provider/remittances"
        element={
          <ProtectedRouteV2 allowedRoles={["provider"]}>
            <ProviderRemittancesPage2 />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/provider/analytics"
        element={
          <ProtectedRouteV2 allowedRoles={["provider"]}>
            <ProviderAnalyticsPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/provider/settings"
        element={
          <ProtectedRouteV2 allowedRoles={["provider"]}>
            <ProviderSettingsPage />
          </ProtectedRouteV2>
        }
      />

      {/* --- Dealership routes --- */}
      <Route
        path="/dealership/overview"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>
            <DealershipOverviewPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/find-products"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>
            <FindProductsPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/contracts"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>
            <DealershipContractsPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/contracts/new"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>
            <NewContractPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/contracts/:id"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>
            <ContractDetailPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/compare"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>
            <DealershipComparePlansPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/coverage/:id"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>
            <ProductCoveragePage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/tire-rim"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>
            <DealershipTireRimPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/remittances"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>
            <DealershipRemittancesPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/reporting"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin", "dealership_employee"]}>
            <DealershipReportingPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/settings/profile"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin"]}>
            <DealershipProfilePage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/settings/team"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin"]}>
            <DealershipTeamManagementPage />
          </ProtectedRouteV2>
        }
      />
      <Route
        path="/dealership/settings/configuration"
        element={
          <ProtectedRouteV2 allowedRoles={["dealership_admin"]}>
            <DealershipConfigurationPage />
          </ProtectedRouteV2>
        }
      />
      {/* No /dealership/settings/billing — billing UI intentionally hidden */}

      {/* ===== Public Brochure routes ===== */}
      {/* compare and tire-rim must come BEFORE :productId */}
      <Route path="/brochure" element={<BrochurePage />} />
      <Route path="/brochure/compare" element={<BrochureComparePage />} />
      <Route path="/brochure/tire-rim" element={<BrochureTireRimPage />} />
      <Route path="/brochure/:productId" element={<BrochureProductDetailPage />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
