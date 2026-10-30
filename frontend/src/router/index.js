import { createRouter, createWebHistory } from "vue-router";
import ShopLayout from "../layouts/ShopLayout.vue";
import AdminLayout from "../layouts/AdminLayout.vue";
import HomeView from "../views/shop/HomeView.vue";
import ProductListView from "../views/shop/ProductListView.vue";
import ProductDetailView from "../views/shop/ProductDetailView.vue";
import FavoritesView from "../views/shop/FavoritesView.vue";
import CartView from "../views/shop/CartView.vue";
import CheckoutView from "../views/shop/CheckoutView.vue";
import SizeAdvisorView from "../views/shop/SizeAdvisorView.vue";
import LoginView from "../views/auth/LoginView.vue";
import RegisterView from "../views/auth/RegisterView.vue";
import ProfileView from "../views/customer/ProfileView.vue";
import AdminLoginView from "../views/admin/AdminLoginView.vue";
import AdminDashboardView from "../views/admin/AdminDashboardView.vue";
import AdminProductView from "../views/admin/AdminProductView.vue";
import AdminCategoryView from "../views/admin/AdminCategoryView.vue";
import AdminSizeChartView from "../views/admin/AdminSizeChartView.vue";
import { useAdminAuthStore } from "../stores/adminAuth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  routes: [
    // ===== Cửa hàng =====
    {
      path: "/",
      component: ShopLayout,
      children: [
        { path: "", name: "home", component: HomeView },
        { path: "san-pham", name: "hqa-products", component: ProductListView, alias: "/products" },
        { path: "san-pham/:id", name: "hqa-product-detail", component: ProductDetailView, alias: "/product/:id" },
        { path: "yeu-thich", name: "hqa-favorites", component: FavoritesView },
        { path: "gio-hang", name: "hqa-cart", component: CartView },
        { path: "thanh-toan", name: "hqa-checkout", component: CheckoutView },
        { path: "tu-van-size", name: "size-advisor", component: SizeAdvisorView },
        { path: "dang-nhap", name: "login", component: LoginView },
        { path: "dang-ky", name: "register", component: RegisterView },
        { path: "tai-khoan", name: "hqa-profile", component: ProfileView },
      ],
    },

    // ===== Quản trị =====
    // Trang đăng nhập admin nằm ngoài AdminLayout và không bị chặn
    { path: "/admin/dang-nhap", name: "admin-login", component: AdminLoginView },
    {
      path: "/admin",
      component: AdminLayout,
      meta: { requiresAdmin: true },
      children: [
        { path: "", name: "hqa-admin-dashboard", component: AdminDashboardView },
        { path: "san-pham", name: "hqa-admin-products", component: AdminProductView },
        { path: "danh-muc", name: "hqa-admin-categories", component: AdminCategoryView },
        { path: "bang-size", name: "hqa-admin-size", component: AdminSizeChartView },
      ],
    },
  ],

  scrollBehavior() {
    return { top: 0 };
  },
});

// Chặn khu vực /admin nếu chưa đăng nhập bằng tài khoản admin
router.beforeEach(async (to) => {
  const admin = useAdminAuthStore();

  if (to.matched.some((record) => record.meta.requiresAdmin)) {
    const ok = await admin.restore(); // hỏi server xác nhận token + quyền admin
    if (!ok) {
      return { name: "admin-login", query: { redirect: to.fullPath } };
    }
  } else if (to.name === "admin-login") {
    // Đã đăng nhập admin rồi thì vào thẳng trang quản trị
    if (await admin.restore()) return { path: "/admin" };
  }
});

export default router;