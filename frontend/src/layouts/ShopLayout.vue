<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { RouterView, useRouter, useRoute } from "vue-router";
import HqaIcon from "../components/common/HqaIcon.vue";
import {
  demo,
  message,
  addSelected,
  showCart,
  showFavorites,
} from "../stores/hqaDemo";
const router = useRouter();
const route = useRoute();
const searchOpen = ref(false),
  searchText = ref(""),
  menuOpen = ref(false);
const dialogElement = ref(null);
const newsletterStatus = ref("Chúng mình không gửi spam. Hủy bất cứ lúc nào.");
const cartCount = computed(() =>
  demo.cart.reduce((sum, item) => sum + item.qty, 0),
);
function scrollToSection(id) {
  nextTick(() =>
    document.getElementById(id)?.scrollIntoView({ block: "start" }),
  );
}
// Nếu đang ở trang khác (tài khoản, đăng nhập...) thì về trang chủ trước, rồi mới chạy việc tiếp theo
async function goHomeThen(next) {
  if (route.path !== "/") {
    await router.push("/");
    await nextTick();
  }
  next?.();
}
function searchProducts() {
  demo.query = searchText.value.trim();
  demo.category = "Tất cả";
  demo.tab = "Bán chạy";
  searchOpen.value = false;
  goHomeThen(() => scrollToSection("products"));
}
function subscribe() {
  newsletterStatus.value =
    "Mã mẫu: HQA10. Đây là mô phỏng, email chưa được lưu hoặc gửi.";
}
function handleClick(event) {
  const target = event.target.closest("a,button");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "search") {
    searchOpen.value = !searchOpen.value;
    if (searchOpen.value)
      nextTick(() => document.querySelector("#search-form input")?.focus());
    return;
  }
  if (action === "menu") {
    menuOpen.value = !menuOpen.value;
    return;
  }
  if (action === "favorites") {
    showFavorites();
    return;
  }
  const href = target.getAttribute("href");
  if (!href?.startsWith("#")) return;
  event.preventDefault();
  menuOpen.value = false;
  if (action === "help") {
    message(
      "Thông tin HQA",
      "Chính sách, ưu đãi và thông tin liên hệ hiện là nội dung minh họa từ mẫu thiết kế.",
    );
    return;
  }
  if (target.dataset.scroll) {
    const id = target.dataset.scroll;
    goHomeThen(() => scrollToSection(id));
    return;
  }
  if (href === "#home") {
    goHomeThen(() => window.scrollTo({ top: 0 }));
    return;
  }
  if (href === "#catalog" || href === "#products") {
    demo.category = target.dataset.cat || "Tất cả";
    demo.query = "";
    demo.tab = target.dataset.sale ? "Sale" : "Bán chạy";
    goHomeThen(() => scrollToSection("products"));
    return;
  }
  if (href === "#cart") {
    showCart();
    return;
  }

  const routes = {
    "#chat": "/tu-van-size",
    "#login": "/dang-nhap",
    "#profile": "/tai-khoan",
  };

  const route = routes[href];

  if (route) {
    event.preventDefault();
    menuOpen.value = false;
    router.push(route);
    return;
  }

  const names = {
    "#profile": "Hồ sơ",
    "#orders": "Đơn hàng",
  };

  message(
    names[href] || "Thông tin",
    "Chức năng này hiện chưa được kết nối backend.",
  );
}
watch(
  () => demo.dialog,
  async (value) => {
    await nextTick();
    if (value && !dialogElement.value.open) dialogElement.value.showModal();
    if (!value && dialogElement.value.open) dialogElement.value.close();
  },
);
function escape(event) {
  if (event.key === "Escape") {
    menuOpen.value = false;
    searchOpen.value = false;
  }
}
onMounted(() => {
  document.title = "HQA · Trang chủ";
  window.addEventListener("keydown", escape);
});
onBeforeUnmount(() => window.removeEventListener("keydown", escape));
</script>
<template>
  <div @click="handleClick">
    <div class="topbar">
      Freeship cho đơn từ 500K · Nhập HQA10 cho đơn đầu tiên
    </div>
    <header class="header">
      <button aria-label="Mở menu" class="ib hamburger" data-action="menu">
        <svg aria-hidden="true" class="icon" viewbox="0 0 24 24">
          <path d="M3 6h18M3 12h18M3 18h18"></path>
        </svg></button
      ><a class="logo" href="#home">HQA</a>
      <nav>
        <a data-cat="Tất cả" href="#catalog">Sản phẩm mới</a
        ><a data-cat="Váy" href="#catalog">Bộ sưu tập</a
        ><a href="#catalog">Bán chạy</a
        ><a class="sale" data-sale="1" href="#catalog">Sale</a
        ><a data-scroll="story" href="#home">Về chúng tôi</a>
      </nav>
      <div class="icons">
        <button aria-label="Tìm kiếm" class="ib" data-action="search">
          <svg aria-hidden="true" class="icon" viewbox="0 0 24 24">
            <circle cx="10.5" cy="10.5" r="6.5"></circle>
            <path d="m16 16 5 5"></path>
          </svg></button
        ><RouterLink
          aria-label="Trang quản trị"
          title="Trang quản trị"
          class="ib desktop-only"
          to="/admin"
          style="
            width: auto;
            padding: 0 12px;
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          "
          >Admin</RouterLink
        ><a aria-label="Tài khoản" class="ib desktop-only" href="#login"
          ><svg aria-hidden="true" class="icon" viewbox="0 0 24 24">
            <circle cx="12" cy="7" r="4"></circle>
            <path d="M4 21v-2a8 8 0 0 1 16 0v2"></path></svg></a
        ><button
          aria-label="Yêu thích"
          class="ib desktop-only"
          data-action="favorites"
        >
          <svg aria-hidden="true" class="icon" viewbox="0 0 24 24">
            <path
              d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"
            ></path>
          </svg></button
        ><a aria-label="Giỏ hàng" class="ib" href="#cart"
          ><svg aria-hidden="true" class="icon" viewbox="0 0 24 24">
            <path d="M5 7h14l1 14H4L5 7Z"></path>
            <path d="M8 8V6a4 4 0 0 1 8 0v2"></path></svg
          ><span class="badge">{{ cartCount }}</span></a
        >
      </div>
    </header>
    <div class="searchbar" id="searchbar" v-if="searchOpen">
      <form @submit.prevent="searchProducts" class="row" id="search-form">
        <input
          aria-label="Tìm sản phẩm"
          name="query"
          placeholder="Bạn đang tìm váy, túi, hay phụ kiện gì?"
          v-model="searchText"
        /><button class="btn dark">Tìm kiếm</button>
      </form>
      <small>Đang hot: váy babydoll · áo cardigan · kẹp tóc ruy băng</small>
    </div>
    <nav v-if="menuOpen" class="mobile-menu" aria-label="Menu điện thoại">
      <a href="#home">Trang chủ</a><a href="#products">Sản phẩm</a
      ><a href="#chat">Tư vấn size</a><a href="#login">Tài khoản</a
      ><RouterLink to="/admin">Admin</RouterLink>
    </nav>
    <main><RouterView /></main>
    <section class="newsletter">
      <h2>Nhận ngay voucher 10%</h2>
      <p>Đăng ký để biết bộ sưu tập mới và ưu đãi riêng.</p>
      <form @submit.prevent="subscribe" class="row" id="newsletter">
        <input
          aria-label="Email nhận ưu đãi"
          placeholder="Email của bạn"
          required=""
          type="email"
        /><button class="btn">Đăng ký</button>
      </form>
      <small id="newsletter-status">{{ newsletterStatus }}</small>
    </section>
    <footer class="footer">
      <div class="footer-grid">
        <div>
          <a class="logo" href="#home">HQA</a>
          <p>Thời trang tinh tế, dịu dàng mỗi ngày.</p>
          <small>Instagram · TikTok · Facebook</small>
        </div>
        <div>
          <h4>Mua sắm</h4>
          <a href="#products">Sản phẩm mới</a><a href="#products">Bán chạy</a
          ><a href="#products">Bộ sưu tập</a><a href="#products">Phụ kiện</a>
        </div>
        <div>
          <h4>Chính sách</h4>
          <a data-action="help" href="#">Đổi trả trong 7 ngày</a
          ><a data-action="help" href="#">Giao hàng</a
          ><a data-action="help" href="#">Bảo mật</a
          ><a data-action="help" href="#">Hướng dẫn chọn size</a>
        </div>
        <div>
          <h4>Liên hệ</h4>
          <p>HQA Việt Nam</p>
          <a href="#chat">Chatbot tư vấn kích thước</a
          ><a data-action="help" href="#">Trợ giúp mua sắm</a
          ><small>09:00–21:00 mỗi ngày</small>
        </div>
      </div>
      <div class="row between footer-bottom">
        <small>© 2026 HQA</small
        ><small>Thanh toán: Visa · MoMo · VietQR · COD</small>
        <RouterLink
          to="/admin"
          style="display: inline; font-size: 12px; margin: 0; opacity: 0.7"
          >Quản trị</RouterLink
        >
      </div>
    </footer>
    <nav class="bottomnav">
      <a href="#home"
        ><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m3 10 9-8 9 8v11H3V10ZM9 21v-8h6v8" /></svg
        >Trang chủ</a
      ><a href="#catalog"
        ><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /></svg
        >Sản phẩm</a
      ><a href="#chat"
        ><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z" />
          <path d="M8 10h8M8 14h5" /></svg
        >Tư vấn size</a
      ><a href="#orders"
        ><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="m12 2 10 5-10 5L2 7l10-5ZM2 7v10l10 5 10-5V7M12 12v10"
          /></svg
        >Đơn hàng</a
      ><a href="#login"
        ><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="7" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg
        >Tài khoản</a
      >
    </nav>
    <div class="floating-chat">
      <a class="btn" href="#chat"><HqaIcon name="chat" />Tư vấn size</a>
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
      <h2 id="dialog-title">{{ demo.dialog.title }}</h2>
      <p>{{ demo.dialog.text }}</p>
      <template v-if="demo.dialog.product">
        <label for="quick-size">Kích thước</label>
        <select id="quick-size" v-model="demo.dialog.size">
          <option
            v-for="size in ['Túi xách', 'Phụ kiện tóc'].includes(
              demo.dialog.product.category,
            )
              ? ['Một cỡ']
              : ['S', 'M', 'L']"
            :key="size"
          >
            {{ size }}
          </option>
        </select>
        <p>
          <small>Màu kem mặc định · Thao tác giỏ hàng chỉ là mô phỏng.</small>
        </p>
      </template>
      <div class="row">
        <button class="btn outline" @click="demo.dialog = null">Đóng</button>
        <button
          v-if="demo.dialog.product"
          class="btn dark"
          @click="addSelected"
        >
          Thêm vào giỏ mẫu
        </button>
      </div>
    </template>
  </dialog>
</template>