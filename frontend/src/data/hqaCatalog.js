/** Dữ liệu minh họa cho giao diện; thay bằng API khi backend hoàn thành. */
export const seedCategories = [
  { id: 'ao', name: 'Áo nữ', icon: '✦' },
  { id: 'dam', name: 'Đầm', icon: '♡' },
  { id: 'chan-vay', name: 'Chân váy', icon: '✿' },
  { id: 'quan', name: 'Quần', icon: '◇' },
  { id: 'set', name: 'Set đồ', icon: '❋' },
  { id: 'phu-kien', name: 'Phụ kiện', icon: '✧' },
]

const images = {
  a: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=960&q=85',
  b: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=960&q=85',
  c: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=960&q=85',
  d: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=960&q=85',
  e: 'https://images.unsplash.com/photo-1551232864-3f0890e580d9?auto=format&fit=crop&w=960&q=85',
  f: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&w=960&q=85',
  g: 'https://images.unsplash.com/photo-1554412933-514a83d2f3c8?auto=format&fit=crop&w=960&q=85',
  h: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=960&q=85',
}
export const seedProducts = [
  { id: 'sp-001', name: 'Áo blouse tay phồng Elise', categoryId: 'ao', price: 329000, oldPrice: 389000, image: images.a, sizes: ['S','M','L','XL'], colors: ['Kem','Hồng'], stock: 28, featured: true, description: 'Chất liệu mềm nhẹ, phom dáng thanh lịch cho những ngày muốn thật dịu dàng.' },
  { id: 'sp-002', name: 'Đầm midi hoa nhí Rosé', categoryId: 'dam', price: 589000, oldPrice: 699000, image: images.b, sizes: ['S','M','L'], colors: ['Hồng','Be'], stock: 15, featured: true, description: 'Đầm midi nữ tính, phù hợp đi dạo phố hay những buổi hẹn cuối tuần.' },
  { id: 'sp-003', name: 'Chân váy chữ A Bella', categoryId: 'chan-vay', price: 359000, oldPrice: 0, image: images.c, sizes: ['S','M','L','XL'], colors: ['Kem','Nâu'], stock: 30, featured: true, description: 'Dáng chữ A dễ phối, tôn vòng eo và tạo cảm giác thoải mái.' },
  { id: 'sp-004', name: 'Quần suông Linen Claire', categoryId: 'quan', price: 429000, oldPrice: 499000, image: images.d, sizes: ['S','M','L','XL'], colors: ['Be','Đen'], stock: 23, featured: true, description: 'Quần suông chất linen thoáng mát, phù hợp phong cách tối giản.' },
  { id: 'sp-005', name: 'Set áo và váy Amélie', categoryId: 'set', price: 749000, oldPrice: 849000, image: images.e, sizes: ['S','M','L'], colors: ['Kem','Hồng'], stock: 12, featured: true, description: 'Set đồ đồng điệu giúp bạn tiết kiệm thời gian phối trang phục.' },
  { id: 'sp-006', name: 'Áo sơ mi cổ nơ Luna', categoryId: 'ao', price: 399000, oldPrice: 0, image: images.f, sizes: ['S','M','L','XL'], colors: ['Trắng','Hồng'], stock: 31, featured: false, description: 'Thiết kế cổ nơ nhẹ nhàng, tạo điểm nhấn cho trang phục công sở.' },
  { id: 'sp-007', name: 'Đầm suông thanh lịch Iris', categoryId: 'dam', price: 619000, oldPrice: 719000, image: images.g, sizes: ['S','M','L','XL'], colors: ['Be','Đen'], stock: 16, featured: false, description: 'Đầm suông tinh tế, dễ mặc và phù hợp nhiều vóc dáng.' },
  { id: 'sp-008', name: 'Chân váy xếp ly Daisy', categoryId: 'chan-vay', price: 379000, oldPrice: 429000, image: images.h, sizes: ['S','M','L'], colors: ['Kem','Hồng'], stock: 19, featured: false, description: 'Từng nếp xếp mềm mại mang nét trẻ trung và lãng mạn.' },
  { id: 'sp-009', name: 'Áo cardigan nhẹ Olivia', categoryId: 'ao', price: 449000, oldPrice: 529000, image: images.d, sizes: ['S','M','L'], colors: ['Kem','Nâu'], stock: 20, featured: false, description: 'Cardigan nhẹ nhàng, lý tưởng để phối theo nhiều lớp.' },
  { id: 'sp-010', name: 'Quần ống rộng Margot', categoryId: 'quan', price: 469000, oldPrice: 0, image: images.a, sizes: ['S','M','L','XL'], colors: ['Kem','Nâu'], stock: 25, featured: false, description: 'Thiết kế ống rộng hiện đại, dễ phối với áo kiểu hay sơ mi.' },
  { id: 'sp-011', name: 'Set dạo phố Bloom', categoryId: 'set', price: 699000, oldPrice: 779000, image: images.b, sizes: ['S','M','L'], colors: ['Hồng','Kem'], stock: 11, featured: false, description: 'Sự kết hợp nhẹ nhàng, tiện lợi cho buổi cà phê cuối tuần.' },
  { id: 'sp-012', name: 'Khăn lụa hoa Lily', categoryId: 'phu-kien', price: 189000, oldPrice: 0, image: images.c, sizes: ['One size'], colors: ['Hồng','Kem'], stock: 40, featured: false, description: 'Phụ kiện nhỏ xinh tạo điểm nhấn cho trang phục.' },
]

export const sizeLabels = ['S', 'M', 'L', 'XL']
/** Dải số đo demo (cm, kg); KHÔNG phải dữ liệu size được xác minh của cửa hàng. */
export const seedSizeChart = [
  { size: 'S', chestMin: 78, chestMax: 84, waistMin: 60, waistMax: 66, hipMin: 84, hipMax: 90, heightMin: 150, heightMax: 160, weightMin: 40, weightMax: 48 },
  { size: 'M', chestMin: 85, chestMax: 90, waistMin: 67, waistMax: 72, hipMin: 91, hipMax: 96, heightMin: 156, heightMax: 165, weightMin: 48, weightMax: 55 },
  { size: 'L', chestMin: 91, chestMax: 97, waistMin: 73, waistMax: 79, hipMin: 97, hipMax: 103, heightMin: 160, heightMax: 170, weightMin: 55, weightMax: 63 },
  { size: 'XL', chestMin: 98, chestMax: 106, waistMin: 80, waistMax: 88, hipMin: 104, hipMax: 112, heightMin: 165, heightMax: 175, weightMin: 63, weightMax: 73 },
]

export const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0))
