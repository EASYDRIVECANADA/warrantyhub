import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "../components/ProtectedRoute";
import { RootLayout } from "../layouts/RootLayout";
import { AdminDashboardPage } from "../pages/AdminDashboardPage";
import { AdminUsersPage } from "../pages/AdminUsersPage";
import { AdminAccessRequestsPage } from "../pages/AdminAccessRequestsPage";
import { BatchesPage } from "../pages/BatchesPage";
import { ContractsPage } from "../pages/ContractsPage";
import { DealerContractDetailPage } from "../pages/DealerContractDetailPage";
import { DealerContractPrintPage } from "../pages/DealerContractPrintPage";
import { DealerContractsPage } from "../pages/DealerContractsPage";
import { DealerAdminPage } from "../pages/DealerAdminPage";
import { DealerAdminContractsPage } from "../pages/DealerAdminContractsPage";
import { DealerComparisonPage } from "../pages/DealerComparisonPage";
import { DealerMarketplacePage } from "../pages/DealerMarketplacePage";
import { DealerMarketplaceProductDetailPage } from "../pages/DealerMarketplaceProductDetailPage";
import { DealerRemittanceBatchPrintPage } from "../pages/DealerRemittanceBatchPrintPage";
import { DealerRemittancesPage } from "../pages/DealerRemittancesPage";
import { DealerDashboardPage } from "../pages/DealerDashboardPage";
import { DealerTeamPage } from "../pages/DealerTeamPage";
import { EmployeesPage } from "../pages/EmployeesPage";
import { HomePage } from "../pages/HomePage";
import { ProviderContractDetailPage } from "../pages/ProviderContractDetailPage";
import { ProviderContractPrintPage } from "../pages/ProviderContractPrintPage";
import { ProviderContractsPage } from "../pages/ProviderContractsPage";
import { ProviderDashboardPage } from "../pages/ProviderDashboardPage";
import { ProviderDocumentsPage } from "../pages/ProviderDocumentsPage";
import { ProviderProductsPage } from "../pages/ProviderProductsPage";
import { GetStartedPage } from "../pages/GetStartedPage";
import { SignInPage } from "../pages/SignInPage";
import { SuperAdminPlatformPage } from "../pages/SuperAdminPlatformPage";
import { RequestAccessPage } from "../pages/RequestAccessPage";
import { ProfilePage } from "../pages/ProfilePage";
import { RemittancesPage } from "../pages/RemittancesPage";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Navigate to="/find-insurance" replace />} />
        <Route path="find-insurance" element={<HomePage />} />

        <Route path="sign-in" element={<SignInPage />} />
        <Route path="get-started" element={<GetStartedPage />} />

        <Route path="login" element={<Navigate to="/sign-in" replace />} />
        <Route element={<ProtectedRoute />}>
          <Route path="request-access" element={<RequestAccessPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["ADMIN", "SUPER_ADMIN"]} />}>
          <Route path="company-dashboard" element={<AdminDashboardPage />} />
          <Route path="admin-users" element={<AdminUsersPage />} />
          <Route path="admin-access-requests" element={<AdminAccessRequestsPage />} />
          <Route path="admin-contracts" element={<ContractsPage title="Admin Contracts" />} />
          <Route path="admin-remittances" element={<RemittancesPage title="Admin Remittances" />} />
          <Route path="admin-batches" element={<BatchesPage title="Admin Batches" />} />
          <Route path="admin-employees" element={<EmployeesPage title="Employees" />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["SUPER_ADMIN"]} />}>
          <Route path="platform" element={<SuperAdminPlatformPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["DEALER_ADMIN"]} />}>
          <Route path="dealer-admin" element={<DealerAdminPage />} />
          <Route path="dealer-contracts-admin" element={<DealerAdminContractsPage />} />
          <Route path="dealer-employees" element={<EmployeesPage title="Employees" />} />
          <Route path="dealer-team" element={<DealerTeamPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["DEALER", "DEALER_ADMIN"]} />}>
          <Route path="dealer-remittances" element={<DealerRemittancesPage />} />
          <Route path="dealer-remittances/batches/:id/print" element={<DealerRemittanceBatchPrintPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["DEALER"]} />}>
          <Route path="dealer-dashboard" element={<DealerDashboardPage />} />
          <Route path="dealer-marketplace" element={<DealerMarketplacePage />} />
          <Route path="dealer-marketplace/compare" element={<DealerComparisonPage />} />
          <Route path="dealer-marketplace/products/:id" element={<DealerMarketplaceProductDetailPage />} />
          <Route path="dealer-contracts" element={<DealerContractsPage />} />
          <Route path="dealer-contracts/:id" element={<DealerContractDetailPage />} />
          <Route path="dealer-contracts/:id/print/:copyType" element={<DealerContractPrintPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["PROVIDER"]} />}>
          <Route path="provider-dashboard" element={<ProviderDashboardPage />} />
          <Route path="provider-contracts" element={<ProviderContractsPage />} />
          <Route path="provider-contracts/:id" element={<ProviderContractDetailPage />} />
          <Route path="provider-contracts/:id/print" element={<ProviderContractPrintPage />} />
          <Route path="provider-products" element={<ProviderProductsPage />} />
          <Route path="provider-documents" element={<ProviderDocumentsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
