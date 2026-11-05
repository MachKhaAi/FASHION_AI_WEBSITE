<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { RouterView, RouterLink, useRouter, useRoute } from "vue-router";
import HqaIcon from "../components/common/HqaIcon.vue";
import { useAdminAuthStore } from "../stores/adminAuth";
import { demo, message, showFavorites } from "../stores/hqaDemo";
import { useHqaShopStore, hasUserToken } from "../stores/hqaShop";

const router = useRouter();
const route = useRoute();
const admin = useAdminAuthStore();
const shop = useHqaShopStore();

// Trạng thái giao diện
const searchOpen = ref(false);
const searchText = ref("");
const menuOpen = ref(false);
const dialogElement = ref(null);
const isAddingToCart = ref(false); // Trạng thái loading của form thêm nhanh
const activeMenuItem = ref("sale");

const newsletterStatus = ref(
  "Chúng mình không gửi spam. Hủy bất cứ lúc nào."
);

// Trạng thái đăng nhập dạng reactive.
// hasUserToken() đọc localStorage nên Vue không tự biết khi token thay đổi
const loggedIn = ref(hasUserToken());
function syncAuth() {
  const now = hasUserToken();
  const justLoggedIn = now && !loggedIn.value;
  loggedIn.value = now;
  if (justLoggedIn) shop.fetchCart();
}

// Số lượng sản phẩm trong giỏ: chưa đăng nhập / đã đăng xuất thì hiện 0
const cartCount = computed(() => (loggedIn.value ? shop.cartCount : 0));

// Hiệu ứng + thông báo khi thêm vào giỏ
const toast = ref({ show: false, text: "" });
const badgeBump = ref(0); // đổi giá trị để chạy lại hiệu ứng nảy của biểu tượng giỏ
let toastTimer = null;
function showToast(text) {
  toast.value = { show: true, text };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value.show = false;
  }, 2200);
}

// Cập nhật khi đổi trang, khi store thay đổi người dùng, hoặc token đổi ở tab khác
watch(() => route.fullPath, syncAuth);
watch(() => shop.viewer, syncAuth);

// Cuộn đến một khu vực trên trang
function scrollToSection(id) {
  nextTick(() => {
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  });
}

// Chuyển về trang chủ trước khi thực hiện thao tác
async function goHomeThen(next) {
  if (route.path !== "/") {
    await router.push("/");
    await nextTick();
  }
  next?.();
}

// Tìm kiếm sản phẩm
function searchProducts() {
  const text = searchText.value.trim();
  searchOpen.value = false;
  menuOpen.value = false;
  router.push({
    name: "hqa-products",
    query: text ? { tim: text } : {},
  });
}

// Đăng ký nhận thông tin
function subscribe() {
  newsletterStatus.value =
    "Mã mẫu: HQA10. Đây là mô phỏng, email chưa được lưu hoặc gửi.";
}

// Xử lý các thao tác trên Header, Footer và Bottom Navigation
function handleClick(event) {
  const target = event.target.closest("a,button");
  if (!target) return;

  const action = target.dataset.action;

  // Tìm kiếm
  if (action === "search") {
    searchOpen.value = !searchOpen.value;
    if (searchOpen.value) {
      nextTick(() => {
        document.querySelector("#search-form input")?.focus();
      });
    }
    return;
  }

  // Menu điện thoại
  if (action === "menu") {
    menuOpen.value = !menuOpen.value;
    return;
  }

  // Sản phẩm yêu thích
  if (action === "favorites") {
    showFavorites();
    return;
  }

  const href = target.getAttribute("href");
  if (!href?.startsWith("#")) return;

  event.preventDefault();
  menuOpen.value = false;

  // Thông tin hỗ trợ
  if (action === "help") {
    message(
      "Thông tin HQA",
      "Chính sách, ưu đãi và thông tin liên hệ hiện là nội dung minh họa từ mẫu thiết kế."
    );
    return;
  }

  // Cuộn đến khu vực cụ thể
  if (target.dataset.scroll) {
    const id = target.dataset.scroll;
    goHomeThen(() => scrollToSection(id));
    return;
  }

  // Trang chủ
  if (href === "#home") {
    goHomeThen(() => window.scrollTo({ top: 0 }));
    return;
  }

  // Trang sản phẩm
  if (href === "#products") {
    router.push("/san-pham");
    return;
  }

  // Danh mục sản phẩm
  if (href === "#catalog") {
    demo.category = target.dataset.cat || "Tất cả";
    demo.query = "";
    demo.tab = target.dataset.sale ? "Sale" : "Bán chạy";
    goHomeThen(() => scrollToSection("products"));
    return;
  }

  // Giỏ hàng thực tế
  if (href === "#cart") {
    if (!hasUserToken()) {
      alert("Vui lòng đăng nhập để xem giỏ hàng!");
      router.push({
        path: "/dang-nhap",
        query: { redirect: "/gio-hang" },
      });
      return;
    }
    router.push("/gio-hang");
    return;
  }

  // Điều hướng các trang khác
  const routes = {
    "#chat": "/tu-van-size",
    "#login": hasUserToken() ? "/thong-tin-ca-nhan" : "/dang-nhap",
    "#profile": "/thong-tin-ca-nhan",
  };

  const routePath = routes[href];
  if (routePath) {
    router.push(routePath);
    return;
  }

  // Các chức năng chưa kết nối backend
  const names = {
    "#profile": "Hồ sơ",
    "#orders": "Đơn hàng",
  };

  message(
    names[href] || "Thông tin",
    "Chức năng này hiện chưa được kết nối backend."
  );
}

// Đồng bộ hộp thoại với dữ liệu
watch(
  () => demo.dialog,
  async (value) => {
    await nextTick();
    if (!dialogElement.value) return;
    if (value && !dialogElement.value.open) {
      dialogElement.value.showModal();
    }
    if (!value && dialogElement.value.open) {
      dialogElement.value.close();
      isAddingToCart.value = false; // Reset trạng thái khi đóng
    }
  }
);

// Đóng menu và tìm kiếm bằng phím Escape
function escape(event) {
  if (event.key === "Escape") {
    menuOpen.value = false;
    searchOpen.value = false;
  }
}

// Hàm xử lý thêm vào giỏ hàng từ popup trên trang chủ
// Lưu ý: shop.addToCart (hqaShop.js) là hàm đồng bộ, trả về true/false
function handleRealAddToCart() {
  if (!hasUserToken()) {
    alert("Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng!");
    demo.dialog = null;
    router.push({ path: "/dang-nhap", query: { redirect: "/" } });
    return;
  }

  const payload = demo.dialog;
  if (!payload?.product) return;

  isAddingToCart.value = true;
  try {
    // Kiểm tra tồn kho của lựa chọn
    const variant = payload.product.variants?.find(
      (v) => v.size === payload.size && v.color === payload.color
    );

    if (payload.product.variants?.length && (!variant || variant.stock <= 0)) {
      alert(
        `Lựa chọn Size ${payload.size} - Màu ${payload.color} hiện đang hết hàng.`
      );
      return;
    }

    const added = shop.addToCart(
      payload.product.id,
      payload.size,
      payload.color, // Màu người dùng chọn ở popup
      1
    );

    if (added) {
      demo.dialog = null; // Đóng form khi thành công
      badgeBump.value++; // chạy hiệu ứng nảy ở biểu tượng giỏ
      showToast("Đã thêm sản phẩm vào giỏ hàng");
    } else {
      alert(
        "Không thể thêm vào giỏ hàng: sản phẩm không đủ hàng hoặc lựa chọn không hợp lệ."
      );
    }
  } catch (error) {
    console.error("Lỗi thêm nhanh:", error);
    alert("Có lỗi xảy ra khi thêm vào giỏ hàng.");
  } finally {
    isAddingToCart.value = false;
  }
}

// Khởi tạo Layout
onMounted(() => {
  document.title = "HQA · Trang chủ";
  admin.restore();

  // Tải giỏ hàng từ backend nếu khách hàng đã đăng nhập
  if (hasUserToken()) {
    shop.fetchCart();
  }

  window.addEventListener("keydown", escape);
  window.addEventListener("storage", syncAuth);
  window.addEventListener("focus", syncAuth);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", escape);
  window.removeEventListener("storage", syncAuth);
  window.removeEventListener("focus", syncAuth);
  clearTimeout(toastTimer);
});
</script>

<template>
  <div @click="handleClick">
    <div class="topbar">
      Freeship cho đơn từ 600K · Nhập HQA10 cho đơn đầu tiên
    </div>

    <header class="header">
      <button aria-label="Mở menu" class="ib hamburger" data-action="menu">
        <svg aria-hidden="true" class="icon" viewBox="0 0 24 24">
          <path d="M3 6h18M3 12h18M3 18h18"></path>
        </svg>
      </button>

      <a class="logo" href="#home">HQA</a>

      <nav>
        <a 
          href="#products" 
          :class="{ active: activeMenuItem === 'new' }"
          @click="activeMenuItem = 'new'"
        >Sản phẩm </a>
        
        <a 
          data-cat="Váy" 
          href="#catalog"
          :class="{ active: activeMenuItem === 'collection' }"
          @click="activeMenuItem = 'collection'"
        >Bộ sưu tập</a>
        
        <a 
          href="#catalog"
          :class="{ active: activeMenuItem === 'bestseller' }"
          @click="activeMenuItem = 'bestseller'"
        >Bán chạy</a>
        
        <a 
          class="sale" 
          data-sale="1" 
          href="#catalog"
          :class="{ active: activeMenuItem === 'sale' }"
          @click="activeMenuItem = 'sale'"
        >Sale</a>
        
        <a 
          data-scroll="story" 
          href="#home"
          :class="{ active: activeMenuItem === 'about' }"
          @click="activeMenuItem = 'about'"
        >Về chúng tôi</a>
      </nav>

      <div class="icons">
        <button aria-label="Tìm kiếm" class="ib" data-action="search">
          <svg aria-hidden="true" class="icon" viewBox="0 0 24 24">
            <circle cx="10.5" cy="10.5" r="6.5"></circle>
            <path d="m16 16 5 5"></path>
          </svg>
        </button>

        <RouterLink
          v-if="false"
          aria-label="Trang quản trị"
          title="Trang quản trị"
          class="ib desktop-only"
          to="/admin"
        >
          Admin
        </RouterLink>

        <a aria-label="Tài khoản" class="ib desktop-only" href="#login">
          <svg aria-hidden="true" class="icon" viewBox="0 0 24 24">
            <circle cx="12" cy="7" r="4"></circle>
            <path d="M4 21v-2a8 8 0 0 1 16 0v2"></path>
          </svg>
        </a>

        <button
          aria-label="Yêu thích"
          class="ib desktop-only"
          data-action="favorites"
        >
          <svg aria-hidden="true" class="icon" viewBox="0 0 24 24">
            <path
              d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"
            ></path>
          </svg>
        </button>

        <a aria-label="Giỏ hàng" class="ib" href="#cart">
          <svg aria-hidden="true" class="icon" viewBox="0 0 24 24">
            <path d="M5 7h14l1 14H4L5 7Z"></path>
            <path d="M8 8V6a4 4 0 0 1 8 0v2"></path>
          </svg>
          <span :key="badgeBump" class="badge" :class="{ bump: badgeBump > 0 }">{{ cartCount }}</span>
        </a>
      </div>
    </header>

    <!-- Thanh tìm kiếm -->
    <div class="searchbar" id="searchbar" v-if="searchOpen">
      <form @submit.prevent="searchProducts" class="row" id="search-form">
        <input
          aria-label="Tìm sản phẩm"
          name="query"
          placeholder="Bạn đang tìm váy, túi, hay phụ kiện gì?"
          v-model="searchText"
        />
        <button class="btn dark">Tìm kiếm</button>
      </form>
      <small>Đang hot: váy babydoll · áo cardigan · kẹp tóc ruy băng</small>
    </div>

    <!-- Menu điện thoại -->
    <nav v-if="menuOpen" class="mobile-menu" aria-label="Menu điện thoại">
      <a href="#home">Trang chủ</a>
      <a href="#products">Sản phẩm</a>
      <a href="#chat">Tư vấn size</a>
      <a href="#login">Tài khoản</a>

      <RouterLink v-if="false" to="/admin">
        Admin
      </RouterLink>
    </nav>

    <main>
      <RouterView />
    </main>

    <!-- Newsletter -->
    <section class="newsletter">
      <h2>Nhận ngay voucher 10%</h2>
      <p>Đăng ký để biết bộ sưu tập mới và ưu đãi riêng.</p>
      <form @submit.prevent="subscribe" class="row" id="newsletter">
        <input
          aria-label="Email nhận ưu đãi"
          placeholder="Email của bạn"
          required
          type="email"
        />
        <button class="btn">Đăng ký</button>
      </form>
      <small id="newsletter-status">
        {{ newsletterStatus }}
      </small>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer-grid">
        <div>
          <a class="logo" href="#home">HQA</a>
          <p>Thời trang tinh tế, dịu dàng mỗi ngày.</p>
          <small>Instagram · TikTok · Facebook</small>
        </div>
        <div>
          <h4>Mua sắm</h4>
          <a href="#products">Sản phẩm</a>
          <a href="#products">Bán chạy</a>
          <a href="#products">Bộ sưu tập</a>
          <a href="#products">Phụ kiện</a>
        </div>
        <div>
          <h4>Chính sách</h4>
          <a data-action="help" href="#">Đổi trả trong 7 ngày</a>
          <a data-action="help" href="#">Giao hàng</a>
          <a data-action="help" href="#">Bảo mật</a>
          <a data-action="help" href="#">Hướng dẫn chọn size</a>
        </div>
        <div>
          <h4>Liên hệ</h4>
          <p>HQA Việt Nam</p>
          <a href="#chat">Chatbot tư vấn kích thước</a>
          <a data-action="help" href="#">Trợ giúp mua sắm</a>
          <small>09:00–21:00 mỗi ngày</small>
        </div>
      </div>
      <div class="row between footer-bottom">
        <small>© 2026 HQA</small>
        <small>Thanh toán: Visa · MoMo · VietQR · COD</small>
        <RouterLink
          v-if="false"
          to="/admin"
          style="display: inline; font-size: 12px; margin: 0; opacity: 0.7"
        >
          Quản trị
        </RouterLink>
      </div>
    </footer>

    <!-- Bottom Navigation -->
    <nav class="bottomnav">
      <a href="#home">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m3 10 9-8 9 8v11H3V10ZM9 21v-8h6v8" />
        </svg>
        Trang chủ
      </a>
      <a href="#catalog">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
        </svg>
        Sản phẩm
      </a>
      <a href="#chat">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z" />
          <path d="M8 10h8M8 14h5" />
        </svg>
        Tư vấn size
      </a>
      <a href="#orders">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 2 10 5-10 5L2 7l10-5ZM2 7v10l10 5 10-5V7M12 12v10" />
        </svg>
        Đơn hàng
      </a>
      <a href="#login">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="7" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </svg>
        Tài khoản
      </a>
    </nav>

    <!-- Nút chatbot -->
    <div class="floating-chat">
      <a class="btn" href="#chat">
        <HqaIcon name="chat" />
        Tư vấn size
      </a>
    </div>
  </div>

  <dialog
    ref="dialogElement"
    class="dialog-shell"
    aria-labelledby="dialog-title"
    @cancel="demo.dialog = null"
    @close="demo.dialog = null"
  >
    <template v-if="demo.dialog">
      <h2 id="dialog-title">
        {{ demo.dialog.title }}
      </h2>
      <p>{{ demo.dialog.text }}</p>

      <template v-if="demo.dialog.product && demo.dialog.type === 'real_add'">
        <!-- Chọn Size thật -->
        <label for="quick-size">Kích thước</label>
        <select id="quick-size" v-model="demo.dialog.size">
          <option
            v-for="size in demo.dialog.product.sizes"
            :key="size"
            :value="size"
          >
            {{ size }}
          </option>
        </select>
        
        <label for="quick-color" style="margin-top: 10px; display: block;">Màu sắc</label>
        <select id="quick-color" v-model="demo.dialog.color">
          <option
            v-for="color in demo.dialog.product.colors"
            :key="color"
            :value="color"
          >
            {{ color }}
          </option>
        </select>

        <p>
          <small>
            Sản phẩm sẽ được thêm trực tiếp vào giỏ hàng của bạn.
          </small>
        </p>
      </template>
      
      <!-- Thông báo cũ của hệ thống demo nếu không phải real_add -->
      <template v-else-if="!demo.dialog.product">
         <!-- Nội dung form thông báo bình thường -->
      </template>

      <div class="row" style="margin-top: 20px;">
        <button
          class="btn outline"
          @click="demo.dialog = null"
          :disabled="isAddingToCart"
        >
          Đóng
        </button>
        
        <!-- Nút Thêm vào giỏ thật -->
        <button
          v-if="demo.dialog.product && demo.dialog.type === 'real_add'"
          class="btn dark"
          @click="handleRealAddToCart"
          :disabled="isAddingToCart"
        >
          {{ isAddingToCart ? 'Đang thêm...' : 'Thêm vào giỏ hàng' }}
        </button>
      </div>
    </template>
  </dialog>

  <!-- Thông báo thêm vào giỏ hàng -->
  <Transition name="cart-toast">
    <div v-if="toast.show" class="cart-toast" role="status" aria-live="polite">
      <svg aria-hidden="true" class="cart-toast-icon" viewBox="0 0 24 24">
        <path d="M5 12.5l4.5 4.5L19 7.5"></path>
      </svg>
      <span>{{ toast.text }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.cart-toast {
  position: fixed;
  top: 84px;
  right: 24px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 999px;
  background: #5c4a42;
  color: #fff;
  font-size: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
.cart-toast-icon {
  width: 20px;
  height: 20px;
  flex: none;
  fill: none;
  stroke: #9be3b0;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.cart-toast-enter-active,
.cart-toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.cart-toast-enter-from,
.cart-toast-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
.badge.bump {
  animation: badge-bump 0.45s ease;
}
@keyframes badge-bump {
  0% { scale: 1; }
  40% { scale: 1.6; }
  100% { scale: 1; }
}
@media (max-width: 600px) {
  .cart-toast {
    top: auto;
    bottom: 90px;
    left: 16px;
    right: 16px;
    justify-content: center;
  }
}
</style>