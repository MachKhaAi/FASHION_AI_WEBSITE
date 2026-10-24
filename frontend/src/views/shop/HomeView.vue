<script setup>
import { computed } from "vue";
import ProductCard from "../../components/shop/ProductCard.vue";
import { products } from "../../mocks/products";
import { demo } from "../../stores/hqaDemo";
function resetFilters() {
  demo.category = "Tất cả";
  demo.query = "";
  demo.tab = "Bán chạy";
}
const visibleProducts = computed(() => {
  let list = products.filter(
    (p) =>
      (demo.category === "Tất cả" || p.category === demo.category) &&
      p.name
        .toLocaleLowerCase("vi")
        .includes(demo.query.toLocaleLowerCase("vi")),
  );
  if (demo.tab === "Hàng mới về")
    list = [...list].sort(
      (a, b) => Number(b.tag === "New") - Number(a.tag === "New"),
    );
  else if (demo.tab === "Xu hướng") list = [...list].reverse();
  else if (demo.tab === "Sale") list = list.filter((p) => p.oldPrice);
  return list;
});
</script>
<template>
  <div>
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Bộ sưu tập thu 2026</span>
        <h1>Dịu dàng, theo cách của bạn</h1>
        <p>
          Những thiết kế nữ tính lấy cảm hứng từ phong cách Hàn Quốc, dành cho
          mỗi ngày của bạn.
        </p>
        <div class="row">
          <a class="btn" href="#products">Khám phá ngay</a
          ><a class="btn dark" href="#products">Mua BST mới</a>
        </div>
      </div>
      <div class="arch">Ảnh editorial người mẫu · khung giữ chỗ</div>
      <div class="dots"><span></span><span></span><span></span></div>
    </section>
    <div class="container">
      <section class="section center">
        <h2>Mua sắm theo phong cách</h2>
        <p class="muted">Chọn nhóm sản phẩm bạn yêu thích</p>
        <div class="categories">
          <a class="category" data-cat="Váy" href="#products"
            ><div class="ph tone0">Ảnh danh mục</div>
            <p>Váy</p></a
          ><a class="category" data-cat="Áo" href="#products"
            ><div class="ph tone1">Ảnh danh mục</div>
            <p>Áo</p></a
          ><a class="category" data-cat="Quần &amp; chân váy" href="#products"
            ><div class="ph tone2">Ảnh danh mục</div>
            <p>Quần &amp; chân váy</p></a
          ><a class="category" data-cat="Set đồ" href="#products"
            ><div class="ph tone3">Ảnh danh mục</div>
            <p>Set đồ</p></a
          ><a class="category" data-cat="Túi xách" href="#products"
            ><div class="ph tone0">Ảnh danh mục</div>
            <p>Túi xách</p></a
          ><a class="category" data-cat="Phụ kiện tóc" href="#products"
            ><div class="ph tone1">Ảnh danh mục</div>
            <p>Phụ kiện tóc</p></a
          >
        </div>
      </section>
      <section class="section" id="products">
        <div class="center">
          <h2>Chọn ngay món bạn yêu</h2>
          <p class="muted">Những lựa chọn nhẹ nhàng cho tủ đồ mỗi ngày.</p>
        </div>
        <div aria-label="Nhóm sản phẩm" class="tabs">
          <button
            :aria-pressed="demo.tab === tab"
            :class="{ active: demo.tab === tab }"
            :key="tab"
            @click="demo.tab = tab"
            v-for="tab in ['Bán chạy', 'Hàng mới về', 'Xu hướng']"
          >
            {{ tab }}
          </button>
        </div>
        <div
          class="filter-note"
          v-if="demo.category !== 'Tất cả' || demo.query"
        >
          <p>
            Danh mục: {{ demo.category }}
            <span v-if="demo.query">· Tìm: {{ demo.query }}</span>
          </p>
          <button @click="resetFilters" class="text-link">Xóa bộ lọc</button>
        </div>
        <div class="product-grid">
          <ProductCard
            :key="product.id"
            :product="product"
            v-for="product in visibleProducts"
          ></ProductCard>
        </div>
        <p class="center" v-if="!visibleProducts.length">
          Không tìm thấy sản phẩm phù hợp.
        </p>
        <div class="center" style="margin-top: 32px">
          <a class="btn outline" href="#products">Xem tất cả</a>
        </div>
      </section>
      <section class="promotion">
        <div>
          <h2>Mid-season Sale<br />giảm đến 40%</h2>
          <div class="countdown">
            <div><b>02</b><small>Ngày</small></div>
            <div><b>03</b><small>Giờ</small></div>
            <div><b>29</b><small>Phút</small></div>
            <div><b>18</b><small>Giây</small></div>
          </div>
          <a class="btn dark" data-sale="1" href="#products">Mua ngay</a>
          <p style="margin: 16px 0 0; font-size: 11px">
            Ưu đãi và thời gian minh họa
          </p>
        </div>
        <div class="ph tone1">Ảnh người mẫu / phụ kiện</div>
      </section>
      <section class="story" id="story">
        <div class="ph tone3">Lookbook · ảnh / video giữ chỗ</div>
        <div
          class="soft"
          style="
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 40px;
          "
        >
          <span class="eyebrow">Câu chuyện HQA</span>
          <p class="quote">
            “Chúng mình tin rằng nữ tính không cần phải ồn ào. Mỗi thiết kế là
            một cách để bạn dịu dàng tỏa sáng.”
          </p>
          <div class="row">
            <a class="btn outline" href="#products">Xem Lookbook</a
            ><a class="text-link" href="#products">Khám phá HQA</a>
          </div>
        </div>
      </section>
      <section class="trust">
        <div>
          <svg aria-hidden="true" class="icon" viewbox="0 0 24 24">
            <path d="M2 5h12v12H2zM14 9h4l4 4v4h-8"></path>
            <circle cx="6" cy="18" r="2"></circle>
            <circle cx="18" cy="18" r="2"></circle></svg
          >Freeship từ 500K
        </div>
        <div>
          <svg aria-hidden="true" class="icon" viewbox="0 0 24 24">
            <path d="m5 4-4 4 4 4M2 8h12a7 7 0 0 1 0 14"></path></svg
          >Đổi trả trong 7 ngày
        </div>
        <div>
          <svg aria-hidden="true" class="icon" viewbox="0 0 24 24">
            <path
              d="m12 2 10 5-10 5L2 7l10-5ZM2 7v10l10 5 10-5V7M12 12v10"
            ></path></svg
          >Kiểm tra hàng khi nhận
        </div>
        <div>
          <svg aria-hidden="true" class="icon" viewbox="0 0 24 24">
            <path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4Z"></path>
            <path d="m8 12 3 3 5-6"></path></svg
          >Thanh toán an toàn
        </div>
      </section>
      <div class="center">
        <h2>Những chia sẻ từ khách hàng</h2>
        <p class="muted">Đánh giá minh họa từ khách đã mua</p>
      </div>
      <div class="testimonials">
        <div class="panel">
          <p>★★★★★</p>
          <p>
            Chất vải mềm, form xinh. Bảng size và tư vấn giúp mình chọn dễ hơn.
          </p>
          <small>Mai Anh · Đã mua hàng</small>
        </div>
        <div class="panel">
          <p>★★★★★</p>
          <p>Màu đúng như mình mong đợi. Đơn được đóng gói cẩn thận.</p>
          <small>Thu Hà · Đã mua hàng</small>
        </div>
        <div class="panel">
          <p>★★★★★</p>
          <p>Phối rất dễ, phù hợp để đi học và đi chơi cuối tuần.</p>
          <small>Ngọc Linh · Đã mua hàng</small>
        </div>
      </div>
    </div>
  </div>
</template>
