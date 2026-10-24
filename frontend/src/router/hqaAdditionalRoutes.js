/**
 * Ghép hqaShopChildren vào children của ShopLayout đang có.
 * Ghép hqaAdminRoute vào routes gốc; KHÔNG ghi đè HomeView/ShopLayout/router cũ.
 */
import ProductListView from '../views/shop/ProductListView.vue'
import ProductDetailView from '../views/shop/ProductDetailView.vue'
import FavoritesView from '../views/shop/FavoritesView.vue'
import CartView from '../views/shop/CartView.vue'
import CheckoutView from '../views/shop/CheckoutView.vue'
import SizeAdvisorView from '../views/shop/SizeAdvisorView.vue'
import LoginView from '../views/auth/LoginView.vue'
import RegisterView from '../views/auth/RegisterView.vue'
import ProfileView from '../views/customer/ProfileView.vue'
import AdminLayout from '../layouts/AdminLayout.vue'
import AdminDashboardView from '../views/admin/AdminDashboardView.vue'
import AdminProductView from '../views/admin/AdminProductView.vue'
import AdminCategoryView from '../views/admin/AdminCategoryView.vue'
import AdminSizeChartView from '../views/admin/AdminSizeChartView.vue'

export const hqaShopChildren = [
  { path: 'san-pham', name: 'hqa-products', component: ProductListView, alias: '/products' },
  { path: 'san-pham/:id', name: 'hqa-product-detail', component: ProductDetailView, alias: '/product/:id' },
  { path: 'yeu-thich', name: 'hqa-favorites', component: FavoritesView },
  { path: 'gio-hang', name: 'hqa-cart', component: CartView },
  { path: 'thanh-toan', name: 'hqa-checkout', component: CheckoutView },
  { path: 'tu-van-size', name: 'hqa-size-advisor', component: SizeAdvisorView },
  { path: 'dang-nhap', name: 'hqa-login', component: LoginView },
  { path: 'dang-ky', name: 'hqa-register', component: RegisterView },
  { path: 'tai-khoan', name: 'hqa-profile', component: ProfileView },
]

// Admin tách hẳn ShopLayout. Chỉ demo UI: cần guard và RBAC ở backend trước khi chạy thật.
export const hqaAdminRoute = {
  path: '/admin', component: AdminLayout,
  children: [
    { path: '', name: 'hqa-admin-dashboard', component: AdminDashboardView },
    { path: 'san-pham', name: 'hqa-admin-products', component: AdminProductView },
    { path: 'danh-muc', name: 'hqa-admin-categories', component: AdminCategoryView },
    { path: 'bang-size', name: 'hqa-admin-size', component: AdminSizeChartView },
  ],
}
