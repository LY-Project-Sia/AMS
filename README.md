# BCC Student Attendance Management System

Professional browser-based attendance and student registry system for BCC Student.

## Bulk Section Import
The Student Management page includes **Import Section**. Upload a complete roster from:
- Excel: `.xlsx`, `.xls`
- CSV: `.csv`
- Microsoft Word: `.docx`
- PDF: text-based `.pdf`

The system previews detected students before importing them into a selected section. Existing student IDs are updated rather than duplicated.

> Scanned/image-only PDFs require OCR and may need to be converted to a text-based PDF or Excel file first.

## Grades
The **Grades** page lets you score each active student on Activity, Quiz, Assignment, Performance Task, Midterm Exam, and Final Exam (0–100 each), plus award **Plus Points** (bonus, 0–50) that get added straight into the Total/Average. Every row also has a **Decision** control:
- **Auto** – standing is calculated automatically (Passing if average ≥ 75, otherwise At Risk).
- **Pass / Fail** – manually override the standing for that student, regardless of their average.
- **Drop Out** – drop the student directly from the Grades page.

Click any column header (Student ID, Name, scores, Total, Average, Standing, etc.) to sort the table ascending/descending — this works the same way on Attendance, Students, and Reports too.

### Quick score entry (great on phones)
Click **✎ Scores** on any row to open a large, one-student-at-a-time entry form — bigger number fields, a live Total/Average/Standing preview, and press **Enter** to jump straight to the next field. Perfect for scoring on a phone during a quiz or activity.

### Bulk scoring via Excel ("download the grading system")
- **Download Template** exports the currently filtered active students with their current scores as an Excel sheet.
- Edit the scores in Excel/Google Sheets — do not change the **Student ID** column.
- Click **Import Scores** and upload the edited file. The system matches by Student ID, previews what will change, and updates every matched student's scores in one click.

## Excel Exports — merged or individual
- **Settings → Download All Data (Merged Excel)** exports one workbook with every dataset as separate sheets: Students, Sections, full Attendance History, Grades, and Dropouts.
- Every page also has its own **individual** export (Attendance, Grades, Students, Dropout List, Reports). Apply a **Section** filter (or search) first to export just that subset.
- **Sections → Export Data** on any section card downloads only that section's students and grades.

## Dropping a Student
Use **Drop** (on Students or Grades) to mark a student as Dropped, with the date recorded automatically. Dropped students are hidden from Attendance and Grades but keep their historical records, are shown with a "Dropped On" date on the Student Management page, and can be **Reinstated** at any time. Filter the roster by status, or use **Export Dropout List** to download just the dropped-out students' data.

## Mobile & desktop friendly
The layout adapts to any screen: Attendance, Students, and Reports switch to a stacked card view on phones so nothing is squeezed into tiny columns; the Grades table keeps its Student ID and Name columns pinned while you scroll sideways through scores; buttons, inputs, and modals resize for touch. The same file works on a phone browser, tablet, or desktop with no separate app.

## Run
Extract the ZIP and open `index.html` in a modern browser.

## Data
The system stores records locally in the browser. Use Settings → Download JSON Backup regularly.
