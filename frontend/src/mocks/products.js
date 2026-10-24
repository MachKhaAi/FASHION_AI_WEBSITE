export const products = [
  {
    id: 0,
    name: "Váy babydoll hoa nhí",
    price: 459000,
    oldPrice: 0,
    tag: "Best Seller",
    category: "Váy",
  },
  {
    id: 1,
    name: "Áo cardigan len mỏng",
    price: 389000,
    oldPrice: 469000,
    tag: "-17%",
    category: "Áo",
  },
  {
    id: 2,
    name: "Chân váy xếp ly",
    price: 329000,
    oldPrice: 0,
    tag: "",
    category: "Quần & chân váy",
  },
  {
    id: 3,
    name: "Set croptop & chân váy",
    price: 599000,
    oldPrice: 0,
    tag: "New",
    category: "Set đồ",
  },
  {
    id: 4,
    name: "Túi tote da mềm",
    price: 519000,
    oldPrice: 649000,
    tag: "-20%",
    category: "Túi xách",
  },
  {
    id: 5,
    name: "Kẹp tóc ruy băng (set 3)",
    price: 89000,
    oldPrice: 0,
    tag: "",
    category: "Phụ kiện tóc",
  },
  {
    id: 6,
    name: "Áo sơ mi cổ nơ",
    price: 359000,
    oldPrice: 0,
    tag: "New",
    category: "Áo",
  },
  {
    id: 7,
    name: "Quần ống rộng lưng cao",
    price: 419000,
    oldPrice: 0,
    tag: "Best Seller",
    category: "Quần & chân váy",
  },
];

export const money = (value) =>
  new Intl.NumberFormat("vi-VN").format(value) + "đ";
