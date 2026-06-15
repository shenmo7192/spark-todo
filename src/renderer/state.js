// State & utilities – must load first
var topics = [];
var categories = [];
var currentTopicId = null;
var currentCategoryId = null;
var currentYearMonth = '';
var tasks = [];
var openedTask = null;
var selectedTaskIds = new Set();
var deleteTargetId = null;
var deleteTargetMode = 'single';
var allMonths = [];
var editingTopicId = null;
var currentStarRating = 1;
var globalNoteTimer = null;
var sortOrder = 'status';          // 'status' | 'time'
var pendingCounts = {};            // categoryId -> count
var allCategories = [];            // all categories (across all topics) for topic badge counts

function $(id) { return document.getElementById(id); }

function formatDateTime(d) {
  if (!d) return '-';
  var date = new Date(d.replace(/-/g, '/'));
  if (isNaN(date)) return d;
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getNowYearMonth() {
  var now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function getLastYearMonth(ym) {
  var parts = ym.split('-').map(Number);
  var lm = parts[1] === 1 ? 12 : parts[1] - 1;
  var ly = parts[1] === 1 ? parts[0] - 1 : parts[0];
  return ly + '-' + String(lm).padStart(2, '0');
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg, type) {
  type = type || 'success';
  var container = $('toastContainer');
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  // Trigger reflow for animation
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}
