<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminAuthStore } from '../../stores/adminAuth'
import {
  adminGetSizeCharts,
  adminCreateSizeChart,
  adminUpdateSizeChart,
  adminDeleteSizeChart,
} from '../../services/api'
import '../../assets/hqa-pages.css'

const router = useRouter()
const admin = useAdminAuthStore()

// Khoảng min/max khớp với validate() trong backend (routes/adminSizeCharts.js)
const FIELDS = [
  { key: 'height', label: 'Chiều cao', unit: 'cm', min: 100, max: 230 },
  { key: 'weight', label: 'Cân nặng', unit: 'kg', min: 20, max: 250 },
  { key: 'chest', label: 'Vòng ngực', unit: 'cm', min: 50, max: 160 },
  { key: 'waist', label: 'Vòng eo', unit: 'cm', min: 40, max: 160 },
  { key: 'hip', label: 'Vòng hông', unit: 'cm', min: 50, max: 170 },
]

const rows = ref([])
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const error = ref('')

const showForm = ref(false)
const editingId = ref(null) // null = đang thêm mới
const form = ref(emptyForm())

function emptyForm() {
  const f = { size_code: '' }
  for (const fld of FIELDS) {
    f[`${fld.key}_min`] = ''
    f[`${fld.key}_max`] = ''
  }
  return f
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function handleAuthError(err) {
  if (err.response?.status === 401 || err.response?.status === 403) {
    admin.logout()
    router.replace('/admin/dang-nhap')
    return true
  }
  return false
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await adminGetSizeCharts()
    rows.value = data.sizeCharts
  } catch (err) {
    if (handleAuthError(err)) return
    error.value = err.response?.data?.message || 'Không thể kết nối máy chủ.'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  message.value = ''
  error.value = ''
  editingId.value = null
  form.value = emptyForm()
  showForm.value = true
  scrollTop()
}

function openEdit(row) {
  message.value = ''
  error.value = ''
  editingId.value = row.id
  const f = { size_code: row.size_code }
  for (const fld of FIELDS) {
    f[`${fld.key}_min`] = row[`${fld.key}_min`]
    f[`${fld.key}_max`] = row[`${fld.key}_max`]
  }
  form.value = f
  showForm.value = true
  scrollTop()
}

function cancelForm() {
  showForm.value = false
  editingId.value = null
  error.value = ''
}

// Trả về chuỗi lỗi, hoặc '' nếu hợp lệ
function validate() {
  const code = form.value.size_code.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,9}$/.test(code)) {
    return 'Mã size chỉ gồm chữ, số, khoảng trắng hoặc gạch ngang, tối đa 10 ký tự (ví dụ: S, M, XL).'
  }
  for (const f of FIELDS) {
    const lo = form.value[`${f.key}_min`]
    const hi = form.value[`${f.key}_max`]
    if (lo === '' || hi === '' || lo === null || hi === null) {
      return `Vui lòng nhập đủ khoảng ${f.label.toLowerCase()} (tối thiểu và tối đa).`
    }
    const a = Number(lo)
    const b = Number(hi)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < f.min || a > f.max || b < f.min || b > f.max) {
      return `${f.label} phải là số nguyên trong khoảng ${f.min}–${f.max} ${f.unit}.`
    }
    if (a > b) return `${f.label}: giá trị tối thiểu không được lớn hơn tối đa.`
  }
  return ''
}

async function save() {
  error.value = ''
  message.value = ''
  const problem = validate()
  if (problem) {
    error.value = problem
    scrollTop()
    return
  }

  const payload = { size_code: form.value.size_code.trim().toUpperCase() }
  for (const f of FIELDS) {
    payload[`${f.key}_min`] = Number(form.value[`${f.key}_min`])
    payload[`${f.key}_max`] = Number(form.value[`${f.key}_max`])
  }

  saving.value = true
  try {
    const { data } = editingId.value
      ? await adminUpdateSizeChart(editingId.value, payload)
      : await adminCreateSizeChart(payload)
    message.value = data.message
    showForm.value = false
    editingId.value = null
    await load()
    scrollTop()
  } catch (err) {
    if (handleAuthError(err)) return
    error.value = err.response?.data?.message || 'Không thể kết nối máy chủ.'
    scrollTop()
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  if (!window.confirm(`Xóa size ${row.size_code}? Thao tác này không thể hoàn tác.`)) return
  error.value = ''
  message.value = ''
  try {
    const { data } = await adminDeleteSizeChart(row.id)
    message.value = data.message
    await load()
  } catch (err) {
    if (handleAuthError(err)) return
    error.value = err.response?.data?.message || 'Không thể kết nối máy chủ.'
  }
}

const range = (row, key) => `${row[`${key}_min`]} – ${row[`${key}_max`]}`

onMounted(load)
</script>

<template>
  <main class="hqa-page hqa-admin-page" style="padding-left:0;padding-right:0">
    <div class="sz-head">
      <div>
        <div class="hqa-eyebrow">SIZE CHART</div>
        <h1>Quản lý bảng size</h1>
        <p class="hqa-dim" style="margin: 6px 0 0">
          Dữ liệu này dùng cho tư vấn size trên cửa hàng. Thay đổi có hiệu lực ngay.
        </p>
      </div>
      <button v-if="!showForm" type="button" class="hqa-primary" @click="openCreate">+ Thêm size</button>
    </div>

    <div v-if="message" class="hqa-note" role="status" style="margin-top: 15px">{{ message }}</div>
    <div v-if="error" class="hqa-alert" role="alert" style="margin-top: 15px">{{ error }}</div>

    <!-- Form thêm / sửa -->
    <section v-if="showForm" class="hqa-panel" style="margin-top: 20px">
      <h3>{{ editingId ? 'Sửa size' : 'Thêm size mới' }}</h3>
      <form @submit.prevent="save">
        <div class="hqa-form-field" style="max-width: 220px">
          <label for="sz-code">Mã size *</label>
          <input id="sz-code" v-model="form.size_code" maxlength="10" placeholder="VD: M" required />
        </div>

        <table class="sz-form-table">
          <thead>
            <tr>
              <th scope="col">Chỉ số</th>
              <th scope="col">Tối thiểu</th>
              <th scope="col">Tối đa</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in FIELDS" :key="f.key">
              <th scope="row">{{ f.label }} ({{ f.unit }})</th>
              <td>
                <input v-model="form[f.key + '_min']" type="number" step="1" :min="f.min" :max="f.max" :aria-label="f.label + ' tối thiểu'" required />
              </td>
              <td>
                <input v-model="form[f.key + '_max']" type="number" step="1" :min="f.min" :max="f.max" :aria-label="f.label + ' tối đa'" required />
              </td>
            </tr>
          </tbody>
        </table>

        <div style="display: flex; gap: 10px; margin-top: 20px">
          <button class="hqa-primary" type="submit" :disabled="saving">{{ saving ? 'Đang lưu...' : 'Lưu' }}</button>
          <button class="hqa-outline" type="button" :disabled="saving" @click="cancelForm">Hủy</button>
        </div>
      </form>
    </section>

    <!-- Danh sách -->
    <section class="hqa-panel" style="margin-top: 20px">
      <div v-if="loading" class="hqa-dim">Đang tải bảng size...</div>
      <div v-else-if="!rows.length" class="hqa-dim">Chưa có size nào. Bấm "Thêm size" để tạo mới.</div>
      <div v-else class="sz-scroll">
        <table class="sz-table">
          <thead>
            <tr>
              <th scope="col">Size</th>
              <th scope="col">Chiều cao (cm)</th>
              <th scope="col">Cân nặng (kg)</th>
              <th scope="col">Vòng ngực (cm)</th>
              <th scope="col">Vòng eo (cm)</th>
              <th scope="col">Vòng hông (cm)</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <th scope="row" class="sz-code">{{ row.size_code }}</th>
              <td v-for="f in FIELDS" :key="f.key">{{ range(row, f.key) }}</td>
              <td>
                <div class="sz-actions">
                  <button type="button" class="hqa-outline" @click="openEdit(row)">Sửa</button>
                  <button type="button" class="hqa-outline sz-danger" @click="remove(row)">Xóa</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<style scoped>
.sz-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.sz-scroll {
  overflow-x: auto;
}

/* Bảng danh sách size */
.sz-table,
.sz-form-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid #ead7dc;
  border-radius: 12px;
  overflow: hidden;
  font-size: 15px;
}
.sz-table th,
.sz-table td,
.sz-form-table th,
.sz-form-table td {
  padding: 12px 14px;
  text-align: center;
  vertical-align: middle;
  border-bottom: 1px solid #f1e6e9;
}
.sz-table thead th,
.sz-form-table thead th {
  background: #fbf1f4;
  color: #a95d73;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}
.sz-table tbody tr:nth-child(even) > *,
.sz-form-table tbody tr:nth-child(even) > * {
  background: #fdf8f9;
}
.sz-table tbody tr:last-child > *,
.sz-form-table tbody tr:last-child > * {
  border-bottom: none;
}
.sz-code {
  font-weight: 700;
  font-size: 16px;
}
.sz-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.sz-danger {
  color: #b4233c;
}

/* Bảng trong form */
.sz-form-table {
  margin-top: 10px;
  max-width: 560px;
}
.sz-form-table tbody th {
  font-weight: 400;
  text-align: left;
  white-space: nowrap;
}
.sz-form-table input {
  width: 100%;
  max-width: 120px;
  box-sizing: border-box;
  text-align: center;
}
</style>