import { reactive } from "vue";
import { products, money } from "../mocks/products";

// Local UI demo only. Reloading clears the selections; no API is called.
export const demo = reactive({
  liked: [],
  cart: [],
  category: "Tất cả",
  query: "",
  tab: "Bán chạy",
  dialog: null,
});
export function message(title, text) {
  demo.dialog = { title, text };
}
export function toggleLike(id) {
  const index = demo.liked.indexOf(id);
  if (index < 0) demo.liked.push(id);
  else demo.liked.splice(index, 1);
}
export function openProduct(product) {
  demo.dialog = {
    title: product.name,
    text: money(product.price),
    product,
    size: ["Túi xách", "Phụ kiện tóc"].includes(product.category)
      ? "Một cỡ"
      : "M",
  };
}
export function addSelected() {
  const { product, size } = demo.dialog;
  const existing = demo.cart.find(
    (item) => item.id === product.id && item.size === size,
  );
  if (existing) existing.qty++;
  else demo.cart.push({ id: product.id, name: product.name, size, qty: 1 });
  message(
    "Đã thêm vào giỏ mẫu",
    `${product.name} · ${size}\nLựa chọn chỉ được giữ trong phiên này. Chưa tạo đơn hàng.`,
  );
}
export function showCart() {
  message(
    "Giỏ hàng mẫu",
    demo.cart.length
      ? demo.cart
          .map((item) => `${item.name} · ${item.size} × ${item.qty}`)
          .join("\n")
      : "Giỏ hàng của bạn đang trống.",
  );
}
export function showFavorites() {
  message(
    "Sản phẩm yêu thích",
    demo.liked.length
      ? products
          .filter((p) => demo.liked.includes(p.id))
          .map((p) => p.name)
          .join("\n")
      : "Bạn chưa chọn sản phẩm yêu thích.",
  );
}
