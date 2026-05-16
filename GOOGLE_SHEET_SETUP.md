# Hướng dẫn kết nối Google Sheet cho SMART ENGLISH SPACESHIP

Giao diện ứng dụng sẽ tự động tải dữ liệu từ Google Sheet của bạn. Bạn chỉ cần cập nhật nội dung vào Sheet, ứng dụng sẽ thay đổi ngay lập tức.

## Bước 1: Chuẩn bị Google Sheet
1. Tạo một Google Sheet mới.
2. Tạo **5 trang tính (Tabs)** với tên chính xác như sau:

- **Worksheets** (Phiếu bài tập):
  - Cột A: `id` | Cột B: `grade` | Cột C: `title` | Cột D: `description` | Cột E: `link` | Cột F: `htmlContent`
- **UnitTests** (Bài kiểm tra Unit):
  - Cột A: `id` | Cột B: `grade` | Cột C: `title` | Cột D: `description` | Cột E: `link` | Cột F: `htmlContent`
- **MockExams** (Bài kiểm tra định kì):
  - Cột A: `id` | Cột B: `grade` | Cột C: `title` | Cột D: `description` | Cột E: `link` | Cột F: `htmlContent`
- **Games** (Game giáo dục):
  - Cột A: `id` | Cột B: `grade` | Cột C: `title` | Cột D: `description` | Cột E: `link` | Cột F: `htmlContent`
- **Questions** (Kho câu hỏi):
  - Cột A: `module_id` | Cột B: `question` | Cột C: `options` | Cột D: `correctAnswer` | Cột E: `explanation`

> **Lưu ý:** `module_id` trong tab **Questions** phải trùng với `id` mà bạn đặt ở 4 tab nội dung trên.

## Cách đưa file HTML hoặc Game lên ứng dụng
Bạn có 2 lựa chọn:

1. **Dùng Link (Cột link):** Dán link từ Wordwall, Quizizz hoặc link file đã upload lên web.
2. **Nhúng trực tiếp (Cột htmlContent):** 
   - Mở file `.html` của bạn bằng Notepad (hoặc bất kỳ trình chỉnh sửa văn bản nào).
   - Copy toàn bộ nội dung (từ `<html>` đến `</html>`).
   - Dán vào cột **htmlContent** trong Sheet. 
   - *Lưu ý:* Cách này rất tốt cho các game nhỏ gọn, không cần upload web thủ công.

## Bước 2: Cài đặt Apps Script
1. Trong Google Sheet, chọn **Extensions > Apps Script**.
2. Xóa hết mã cũ và dán đoạn mã (bạn có thể copy trực tiếp trong nút "Copy mã Apps Script" ở phần Settings của ứng dụng) hoặc dùng mã dưới đây:

```javascript
function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsMapping = {
    "Worksheets": "worksheet",
    "UnitTests": "unit_test",
    "MockExams": "mock_exam",
    "Games": "game"
  };

  let allModules = [];

  // Lấy dữ liệu từ 4 tab nội dung
  Object.keys(sheetsMapping).forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data.shift();
      data.forEach(row => {
        let obj = { type: sheetsMapping[sheetName], questions: [] };
        headers.forEach((header, i) => obj[header] = row[i]);
        if (obj.id) allModules.push(obj);
      });
    }
  });

  // Lấy dữ liệu câu hỏi
  const questionsSheet = ss.getSheetByName("Questions");
  if (questionsSheet) {
    const qData = questionsSheet.getDataRange().getValues();
    const qHeaders = qData.shift();
    qData.forEach(row => {
      let q = {};
      qHeaders.forEach((header, i) => q[header] = row[i]);
      if (typeof q.options === 'string') q.options = q.options.split(',').map(s => s.trim());
      const parent = allModules.find(m => m.id === q.module_id);
      if (parent) parent.questions.push(q);
    });
  }

  // Cấu trúc lại theo Grade cho App
  const result = { grades: { 1: emptyGrade(), 2: emptyGrade(), 3: emptyGrade(), 4: emptyGrade(), 5: emptyGrade() } };
  allModules.forEach(m => {
    const g = parseInt(m.grade);
    if (result.grades[g]) {
      if (m.type === 'worksheet') result.grades[g].worksheets.push(m);
      else if (m.type === 'unit_test') result.grades[g].unitTests.push(m);
      else if (m.type === 'mock_exam') result.grades[g].mockExams.push(m);
      else if (m.type === 'game') result.grades[g].games.push(m);
    }
  });

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

## Cách đưa file HTML hoặc Game lên ứng dụng
Bạn không cần dán code HTML vào Sheet, chỉ cần dán **Link**.
1. **Dùng Web có sẵn:** Dán link từ Wordwall, Quizizz (phần chia sẻ công khai).
2. **Dùng file HTML tự soạn:** 
   - Tải file HTML lên một dịch vụ lưu trữ (ví dụ: Google Drive, GitHub Pages, hoặc TinyHost).
   - Nếu dùng Google Drive: Chuột phải vào file > Share > Anyone with the link can view. Sau đó dùng công cụ "Direct link generator" để tạo link trực tiếp dạng `https://drive.google.com/uc?id=...` hoặc `https://your-site.com/game.html`.
   - Dán link này vào cột **link** trong Sheet.
```

3. Nhấn **Deploy > New Deployment**.
4. Chọn Type là **Web App**. 
5. Cấu hình: 
   - Execute as: **Me**
   - Who has access: **Anyone** (Quan trọng để ứng dụng có thể đọc được)
6. Nhấn **Deploy** và Copy đoạn **Web App URL**.

## Bước 3: Kết nối với Ứng dụng
1. Mở ứng dụng Smart Kid English.
2. Vào phần **Settings** (biểu tượng bánh răng).
3. Dán Web App URL vào ô và nhấn Lưu.
