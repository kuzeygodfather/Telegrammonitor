"use client";

import Link from "next/link";

import { useEffect, useState, useRef, useCallback } from "react";
import { Clock, Plus, Trash2, Download, Upload, UserPlus, X, AlertCircle, Search, Users, FileSpreadsheet, ChevronDown, ArrowRight, Check, HelpCircle, Calendar, Wand2, ChevronLeft, ChevronRight, Tag, BookOpen } from "lucide-react";
import { getStaffWithShifts, getStaffWithShiftsByPeriod, getTodayStaffWithShifts, createStaff, deleteStaff, upsertShift, upsertShiftWithPeriod, bulkUpsertShifts, bulkUpsertShiftsWithPeriod, getCurrentShiftStaff, getGroupSenders, getStaffList, getShiftPeriods, createShiftPeriod, deleteShiftPeriod, updateStaffRole, generateRotatingShifts, generateAIShifts, STAFF_ROLES, DEPARTMENT_OPTIONS } from "@/lib/api";
import type { StaffWithShifts, GroupSender, Staff, ShiftPeriod } from "@/lib/api";
import * as XLSX from "xlsx";

const DAYS = ["Pazartesi", "Sal\u0131", "\u00c7ar\u015famba", "Per\u015fembe", "Cuma", "Cumartesi", "Pazar"];
const DAYS_SHORT = ["Pzt", "Sal", "\u00c7ar", "Per", "Cum", "Cmt", "Paz"];
const DAY_ALIASES: Record<string, number> = {
  pazartesi: 0, pzt: 0, monday: 0, mon: 0,
  "sal\u0131": 1, sal: 1, tuesday: 1, tue: 1,
  "\u00e7ar\u015famba": 2, "\u00e7ar": 2, carsamba: 2, car: 2, wednesday: 2, wed: 2,
  "per\u015fembe": 3, per: 3, thursday: 3, thu: 3,
  cuma: 4, cum: 4, friday: 4, fri: 4,
  cumartesi: 5, cmt: 5, saturday: 5, sat: 5,
  pazar: 6, paz: 6, sunday: 6, sun: 6,
};

const SHIFT_PRESETS = [
  { label: "00:00-08:00", start: "00:00", end: "08:00" },
  { label: "08:00-16:00", start: "08:00", end: "16:00" },
  { label: "09:00-18:00", start: "09:00", end: "18:00" },
  { label: "12:00-20:00", start: "12:00", end: "20:00" },
  { label: "16:00-00:00", start: "16:00", end: "00:00" },
  { label: "20:00-04:00", start: "20:00", end: "04:00" },
  { label: "\u0130zin", start: null, end: null },
];

const ROLE_COLORS: Record<string, string> = {
  agent: "bg-blue-600/20 text-blue-300 border-blue-600/30",
  admin: "bg-purple-600/20 text-purple-300 border-purple-600/30",
  finans: "bg-green-600/20 text-green-300 border-green-600/30",
  marketing: "bg-orange-600/20 text-orange-300 border-orange-600/30",
  it: "bg-cyan-600/20 text-cyan-300 border-cyan-600/30",
};

function formatTime(t: string): string {
  // "16:00:00" -> "16.00" or "08:00" -> "08.00"
  const parts = t.split(":");
  return `${parts[0]}.${parts[1]}`;
}

function formatShift(shift: { shift_start: string | null; shift_end: string | null; is_off: boolean } | undefined): string {
  if (!shift) return "-";
  if (shift.is_off) return "\u0130zin";
  if (shift.shift_start && shift.shift_end) return `${formatTime(shift.shift_start)}-${formatTime(shift.shift_end)}`;
  return "-";
}

function getShiftColor(shift: { shift_start: string | null; shift_end: string | null; is_off: boolean } | undefined): string {
  if (!shift) return "";
  if (shift.is_off) return "bg-red-600/30 text-red-300";
  if (shift.shift_start) {
    const hour = parseInt(shift.shift_start.split(":")[0]);
    if (hour >= 0 && hour < 8) return "bg-indigo-600/20 text-indigo-300";
    if (hour >= 8 && hour < 12) return "bg-green-600/20 text-green-300";
    if (hour >= 12 && hour < 16) return "bg-yellow-600/20 text-yellow-300";
    return "bg-purple-600/20 text-purple-300";
  }
  return "";
}

function parseDayIndex(header: string): number {
  const clean = header.toLowerCase().trim();
  if (DAY_ALIASES[clean] !== undefined) return DAY_ALIASES[clean];
  for (const [alias, idx] of Object.entries(DAY_ALIASES)) { if (clean.includes(alias)) return idx; }
  return -1;
}

function parseShiftValue(val: string): { start: string | null; end: string | null; isOff: boolean } {
  if (!val || val.trim() === "" || val.trim() === "-") return { start: null, end: null, isOff: false };
  const v = val.trim();
  if (v.toLowerCase() === "izin" || v === "\u0130zin" || v.toLowerCase() === "off") return { start: null, end: null, isOff: true };
  const match = v.match(/(\d{1,2})[.:\-](\d{2})\s*[-\u2013\u2014]\s*(\d{1,2})[.:\-](\d{2})/);
  if (match) return { start: `${match[1].padStart(2, "0")}:${match[2]}`, end: `${match[3].padStart(2, "0")}:${match[4]}`, isOff: false };
  return { start: null, end: null, isOff: false };
}

type ShiftEntry = { staff_name: string; day_of_week: number; shift_start: string | null; shift_end: string | null; is_off: boolean };

function parseFileData(rows: string[][]): ShiftEntry[] {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const dayColumns: { col: number; day: number }[] = [];
  for (let c = 1; c < headers.length; c++) { const d = parseDayIndex(headers[c]); if (d >= 0) dayColumns.push({ col: c, day: d }); }
  if (dayColumns.length === 0) { for (let c = 1; c < headers.length && c <= 7; c++) dayColumns.push({ col: c, day: c - 1 }); }
  const shifts: ShiftEntry[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; const staffName = (row[0] || "").trim(); if (!staffName) continue;
    for (const dc of dayColumns) { const val = (row[dc.col] || "").trim(); if (!val || val === "-") continue; const p = parseShiftValue(val); if (p.isOff || p.start) shifts.push({ staff_name: staffName, day_of_week: dc.day, shift_start: p.start, shift_end: p.end, is_off: p.isOff }); }
  }
  return shifts;
}

interface UnmatchedEntry { originalName: string; selectedMatch: string; suggestion: string | null; }

export default function ShiftsPage() {
  const [data, setData] = useState<StaffWithShifts[]>([]);
  const [todayData, setTodayData] = useState<StaffWithShifts[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editCell, setEditCell] = useState<{ staffId: number; day: number } | null>(null);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [senders, setSenders] = useState<GroupSender[]>([]);
  const [senderSearch, setSenderSearch] = useState("");
  const [loadingSenders, setLoadingSenders] = useState(false);
  const [selectedSenders, setSelectedSenders] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [showMatchPanel, setShowMatchPanel] = useState(false);
  const [unmatchedEntries, setUnmatchedEntries] = useState<UnmatchedEntry[]>([]);
  const [pendingShifts, setPendingShifts] = useState<ShiftEntry[]>([]);
  const [allSenderNames, setAllSenderNames] = useState<string[]>([]);
  const [matchSearch, setMatchSearch] = useState<Record<string, string>>({});

  // Period state
  const [periods, setPeriods] = useState<ShiftPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [periodDept, setPeriodDept] = useState<string>("all");
  const [showPeriodCreate, setShowPeriodCreate] = useState(false);
  const [periodName, setPeriodName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [uploadPeriodId, setUploadPeriodId] = useState<number | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Auto generate state
  const [showAutoGen, setShowAutoGen] = useState(false);
  const [genStartDate, setGenStartDate] = useState("");
  const [genWeeks, setGenWeeks] = useState(1);
  const [genPreview, setGenPreview] = useState<ReturnType<typeof generateRotatingShifts>>([]);
  const [genPreviewWeek, setGenPreviewWeek] = useState(0);
  const [editingRole, setEditingRole] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      const [result, periodList, todayResult] = await Promise.all([
        selectedPeriod ? getStaffWithShiftsByPeriod(selectedPeriod, deptFilter) : (deptFilter !== "all" ? getStaffWithShiftsByPeriod(null, deptFilter) : getStaffWithShifts()),
        getShiftPeriods(),
        getTodayStaffWithShifts(),
      ]);
      setData(result);
      setPeriods(periodList);
      setTodayData(todayResult);
    } catch (e) { console.error("Shift data fetch error:", e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [selectedPeriod, deptFilter]);
  const { onDuty, offDuty } = getCurrentShiftStaff(todayData);

  // Period helpers
  const currentPeriod = periods.find((p) => p.id === selectedPeriod);
  const formatDate = (d: string) => { const dt = new Date(d + "T00:00:00"); return dt.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }); };

  const handleCreatePeriod = async () => {
    if (!periodStart || !periodEnd) return;
    setSaving(true);
    try {
      const deptLabel = periodDept !== "all" ? ` [${DEPARTMENT_OPTIONS[periodDept]}]` : "";
      const name = periodName ? `${periodName}${deptLabel}` : `${periodStart} - ${periodEnd}${deptLabel}`;
      const period = await createShiftPeriod(name, periodStart, periodEnd, periodDept);
      setSelectedPeriod(period.id);
      setShowPeriodCreate(false);
      setPeriodName(""); setPeriodStart(""); setPeriodEnd("");
      await fetchData();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDeletePeriod = async (id: number) => {
    if (!confirm("Bu donemi ve tum vardiyalarini silmek istediginize emin misiniz?")) return;
    await deleteShiftPeriod(id);
    if (selectedPeriod === id) setSelectedPeriod(null);
    await fetchData();
  };

  // Staff handlers
  const handleOpenAddStaff = async () => {
    setShowAddStaff(true); setLoadingSenders(true); setSenderSearch(""); setSelectedSenders(new Set());
    try {
      const [senderList, staffList] = await Promise.all([getGroupSenders(), getStaffList()]);
      const existing = new Set(staffList.map((s) => s.name.toLowerCase()));
      setSenders(senderList.filter((s) => !existing.has(s.sender_name.toLowerCase())));
    } catch (e) { console.error(e); } finally { setLoadingSenders(false); }
  };
  const toggleSender = (name: string) => { setSelectedSenders((p) => { const n = new Set(p); if (n.has(name)) n.delete(name); else n.add(name); return n; }); };
  const handleAddSelected = async () => {
    if (selectedSenders.size === 0) return; setSaving(true);
    try { for (const name of selectedSenders) await createStaff(name); setShowAddStaff(false); setSelectedSenders(new Set()); await fetchData(); }
    catch (e) { console.error(e); } finally { setSaving(false); }
  };
  const handleDeleteStaff = async (id: number, name: string) => { if (!confirm(`"${name}" personelini silmek istediginize emin misiniz?`)) return; await deleteStaff(id); await fetchData(); };

  const handleShiftSelect = async (staffId: number, day: number, preset: typeof SHIFT_PRESETS[0]) => {
    setSaving(true);
    try {
      if (selectedPeriod) { await upsertShiftWithPeriod(staffId, day, preset.start, preset.end, preset.start === null, selectedPeriod); }
      else { await upsertShift(staffId, day, preset.start, preset.end, preset.start === null); }
      setEditCell(null); await fetchData();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleRoleChange = async (staffId: number, role: string) => {
    await updateStaffRole(staffId, role);
    setEditingRole(null);
    await fetchData();
  };

  // Export
  const handleExportExcel = () => {
    const wsData: string[][] = [["Personel", "Rol", ...DAYS]];
    data.forEach((sw) => { const row = [sw.staff.name, STAFF_ROLES[(sw.staff as Staff & {role?:string}).role || "agent"] || "Agent"]; for (let d = 0; d < 7; d++) row.push(formatShift(sw.shifts[d])); wsData.push(row); });
    const ws = XLSX.utils.aoa_to_sheet(wsData); ws["!cols"] = [{ wch: 18 }, { wch: 18 }, ...DAYS.map(() => ({ wch: 14 }))];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, currentPeriod?.name || "Vardiyalar");
    XLSX.writeFile(wb, `vardiya_${currentPeriod?.name || "tablo"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowExportMenu(false);
  };
  const handleExportCSV = () => {
    const header = ["Personel", ...DAYS].join(",");
    const rows = data.map((sw) => { const cells = [sw.staff.name]; for (let d = 0; d < 7; d++) cells.push(formatShift(sw.shifts[d])); return cells.join(","); });
    const csv = [header, ...rows].join("\n"); const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `vardiya_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url); setShowExportMenu(false);
  };
  const handleDownloadTemplate = () => {
    const wsData = [["Personel", ...DAYS], ["Ornek 1", "08.00-16.00", "08.00-16.00", "08.00-16.00", "08.00-16.00", "08.00-16.00", "Izin", "Izin"], ["Ornek 2", "16.00-00.00", "16.00-00.00", "Izin", "16.00-00.00", "16.00-00.00", "16.00-00.00", "16.00-00.00"]];
    const ws = XLSX.utils.aoa_to_sheet(wsData); ws["!cols"] = [{ wch: 20 }, ...DAYS.map(() => ({ wch: 15 }))];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sablon"); XLSX.writeFile(wb, "vardiya_sablonu.xlsx"); setShowExportMenu(false);
  };

  // Import with matching
  const processImportData = async (shifts: ShiftEntry[]) => {
    if (shifts.length === 0) { setImportStatus("Gecerli vardiya verisi bulunamadi"); return; }
    setImportStatus("Personel eslestiriliyor...");
    const [staffList, senderList] = await Promise.all([getStaffList(), getGroupSenders()]);
    const knownNames = [...staffList.map((s) => s.name), ...senderList.map((s) => s.sender_name)];
    const knownLower = knownNames.map((n) => n.toLowerCase()); const uniqueKnown = [...new Set(knownNames)];
    setAllSenderNames(uniqueKnown);
    const fileNames = [...new Set(shifts.map((s) => s.staff_name))];
    const autoMatched: Record<string, string> = {}; const unmatched: UnmatchedEntry[] = [];
    for (const name of fileNames) {
      const lower = name.toLowerCase(); const exactIdx = knownLower.findIndex((k) => k === lower);
      if (exactIdx >= 0) { autoMatched[name] = knownNames[exactIdx]; continue; }
      let bestMatch: string | null = null; let bestScore = 0;
      for (const known of uniqueKnown) { const kl = known.toLowerCase(); if (kl.includes(lower) || lower.includes(kl)) { const score = Math.min(lower.length, kl.length) / Math.max(lower.length, kl.length); if (score > bestScore) { bestScore = score; bestMatch = known; } } }
      if (bestMatch && bestScore > 0.5) autoMatched[name] = bestMatch;
      else unmatched.push({ originalName: name, selectedMatch: "", suggestion: bestMatch });
    }
    for (const shift of shifts) { if (autoMatched[shift.staff_name]) shift.staff_name = autoMatched[shift.staff_name]; }
    if (unmatched.length === 0) {
      setImportStatus(`${shifts.length} vardiya yukleniyor...`);
      try {
        if (uploadPeriodId) await bulkUpsertShiftsWithPeriod(shifts, uploadPeriodId);
        else await bulkUpsertShifts(shifts);
        setImportStatus(`${shifts.length} vardiya basariyla yuklendi!`); await fetchData();
      } catch (err) { setImportStatus("Hata: " + String(err)); }
      setTimeout(() => setImportStatus(null), 5000);
    } else { setUnmatchedEntries(unmatched); setPendingShifts(shifts); setShowMatchPanel(true); setImportStatus(null); }
  };

  const handleConfirmMatches = async () => {
    setSaving(true); const shifts = [...pendingShifts];
    for (const entry of unmatchedEntries) { if (entry.selectedMatch) shifts.forEach((s) => { if (s.staff_name === entry.originalName) s.staff_name = entry.selectedMatch; }); }
    setShowMatchPanel(false); setImportStatus(`${shifts.length} vardiya yukleniyor...`);
    try {
      if (uploadPeriodId) await bulkUpsertShiftsWithPeriod(shifts, uploadPeriodId);
      else await bulkUpsertShifts(shifts);
      setImportStatus(`${shifts.length} vardiya yuklendi!`); await fetchData();
    } catch (err) { setImportStatus("Hata: " + String(err)); }
    finally { setSaving(false); } setTimeout(() => setImportStatus(null), 5000);
  };

  const handleSkipMatching = async () => {
    setSaving(true); setShowMatchPanel(false);
    try {
      if (uploadPeriodId) await bulkUpsertShiftsWithPeriod(pendingShifts, uploadPeriodId);
      else await bulkUpsertShifts(pendingShifts);
      setImportStatus("Vardiyalar yuklendi."); await fetchData();
    } catch (err) { setImportStatus("Hata: " + String(err)); }
    finally { setSaving(false); } setTimeout(() => setImportStatus(null), 5000);
  };

  const handleFileImport = async (file: File) => {
    setImportStatus("Dosya okunuyor..."); const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      let rows: string[][] = [];
      if (ext === "xlsx" || ext === "xls") { const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: "array" }); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as string[][]; }
      else if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp") {
        setImportStatus("Resim AI ile analiz ediliyor...");
        const buf = await file.arrayBuffer(); const bytes = new Uint8Array(buf); let binary = ""; for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const res = await fetch("/api/parse-shift-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: btoa(binary), mime_type: file.type || "image/jpeg" }) });
        const result = await res.json();
        if (result.error) { setImportStatus("Resim hatasi: " + result.error); setTimeout(() => setImportStatus(null), 5000); return; }
        if (result.shifts?.length > 0) { setImportStatus(`Resimden ${result.shifts.length} vardiya algilandi.`); await processImportData(result.shifts); return; }
        setImportStatus("Resimden veri alinamadi"); setTimeout(() => setImportStatus(null), 4000); return;
      }
      else { const text = await file.text(); rows = text.split("\n").filter((l: string) => l.trim()).map((l: string) => l.split(",").map((c: string) => c.trim())); }
      await processImportData(parseFileData(rows));
    } catch (err) { setImportStatus("Dosya hatasi: " + String(err)); setTimeout(() => setImportStatus(null), 4000); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportWithDate = () => { setShowDatePicker(true); };
  const handleImportChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleFileImport(f); };
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (["xlsx","xls","csv","txt","jpg","jpeg","png","webp"].includes(ext || "")) handleFileImport(f);
    else { setImportStatus("Desteklenen: .xlsx, .csv, .jpg, .png"); setTimeout(() => setImportStatus(null), 3000); }
  }, [uploadPeriodId]);

  // Auto Generate
  const [genRules, setGenRules] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genUsage, setGenUsage] = useState<{input: number; output: number} | null>(null);

  const handleAutoGenPreview = async () => {
    setGenLoading(true);
    setGenUsage(null);
    try {
      const staffList = await getStaffList();
      if (staffList.length === 0) {
        setImportStatus("Once personel eklemelisiniz");
        setTimeout(() => setImportStatus(null), 3000);
        setGenLoading(false);
        return;
      }

      // Get last week's shifts for context
      const lastPeriod = periods.length > 0 ? periods[0] : null;
      let history: { name: string; shifts: { day: number; val: string }[] }[] = [];
      if (lastPeriod) {
        const lastData = await getStaffWithShiftsByPeriod(lastPeriod.id);
        history = lastData.filter((sw) => Object.keys(sw.shifts).length > 0).map((sw) => ({
          name: sw.staff.name,
          shifts: Object.entries(sw.shifts).map(([d, s]) => ({
            day: Number(d),
            val: s.is_off ? "Izin" : `${s.shift_start}-${s.shift_end}`,
          })),
        }));
      }

      const result = await generateAIShifts(
        staffList as (Staff & { role?: string })[],
        genWeeks,
        genRules,
        history
      );

      if (result.usage) setGenUsage(result.usage);

      // Convert to preview format
      const preview = result.shifts.map((s) => ({
        weekIndex: s.week,
        staffId: staffList.find((st) => st.name === s.staff_name)?.id || 0,
        staffName: s.staff_name,
        role: (staffList.find((st) => st.name === s.staff_name) as Staff & {role?:string})?.role || "agent",
        day: s.day,
        start: s.shift_start,
        end: s.shift_end,
        isOff: s.is_off,
      }));

      setGenPreview(preview);
      setGenPreviewWeek(0);
    } catch (err) {
      setImportStatus("AI shift hatasi: " + String(err));
      setTimeout(() => setImportStatus(null), 5000);
    } finally {
      setGenLoading(false);
    }
  };

  const handleAutoGenSave = async () => {
    if (!genStartDate || genPreview.length === 0) return;
    setSaving(true);
    try {
      for (let w = 0; w < genWeeks; w++) {
        const weekStart = new Date(genStartDate + "T00:00:00");
        weekStart.setDate(weekStart.getDate() + w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const sStr = weekStart.toISOString().slice(0, 10);
        const eStr = weekEnd.toISOString().slice(0, 10);
        const period = await createShiftPeriod(`Hafta ${w + 1} (${sStr})`, sStr, eStr);
        const weekShifts = genPreview.filter((s) => s.weekIndex === w);
        for (const s of weekShifts) {
          await upsertShiftWithPeriod(s.staffId, s.day, s.start, s.end, s.isOff, period.id);
        }
      }
      setShowAutoGen(false);
      setImportStatus(`${genWeeks} haftalik vardiya olusturuldu!`);
      await fetchData();
    } catch (err) { setImportStatus("Hata: " + String(err)); }
    finally { setSaving(false); }
    setTimeout(() => setImportStatus(null), 5000);
  };

  const filteredSenders = senders.filter((s) => s.sender_name.toLowerCase().includes(senderSearch.toLowerCase()) || s.group_titles.some((g) => g.toLowerCase().includes(senderSearch.toLowerCase())));
  const weekPreviewData = genPreview.filter((s) => s.weekIndex === genPreviewWeek);
  const previewStaff = [...new Set(weekPreviewData.map((s) => s.staffName))];

  if (loading) return (<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>);

  return (
    <div className="space-y-6" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
      {dragOver && (<div className="fixed inset-0 z-50 bg-blue-600/20 backdrop-blur-sm flex items-center justify-center pointer-events-none"><div className="bg-gray-800 border-2 border-dashed border-blue-500 rounded-2xl p-12 text-center"><FileSpreadsheet className="w-16 h-16 text-blue-400 mx-auto mb-4" /><p className="text-xl font-semibold text-blue-300">Dosyayi buraya birakin</p><p className="text-sm text-gray-400 mt-2">Excel, CSV veya Resim</p></div></div>)}

      {/* MATCH PANEL */}
      {showMatchPanel && (<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-gray-700"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-orange-600/20 rounded-xl flex items-center justify-center"><HelpCircle className="w-5 h-5 text-orange-400" /></div><div><h2 className="text-lg font-bold">Eslestirme Gerekli</h2><p className="text-xs text-gray-400">{unmatchedEntries.length} kisi eslestirilemedi</p></div></div></div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{unmatchedEntries.map((entry, idx) => {
          const search = (matchSearch[entry.originalName] || "").toLowerCase();
          const filtered = allSenderNames.filter((n) => n.toLowerCase().includes(search));
          return (<div key={entry.originalName} className="bg-gray-900 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center gap-3 mb-3"><span className="bg-orange-600/20 text-orange-300 text-xs font-bold px-2 py-1 rounded">?</span><span className="font-semibold">{entry.originalName}</span><ArrowRight className="w-4 h-4 text-gray-600" />{entry.selectedMatch ? <span className="bg-green-600/20 text-green-300 text-xs px-2 py-1 rounded flex items-center gap-1"><Check className="w-3 h-3" /> {entry.selectedMatch}</span> : <span className="text-gray-500 text-xs">Bekleniyor...</span>}</div>
            {entry.suggestion && !entry.selectedMatch && (<button onClick={() => { const u = [...unmatchedEntries]; u[idx].selectedMatch = entry.suggestion!; setUnmatchedEntries(u); }} className="mb-2 text-xs bg-blue-600/20 border border-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-600/30">Oneri: {entry.suggestion}</button>)}
            <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" /><input type="text" placeholder="Ara..." value={matchSearch[entry.originalName] || ""} onChange={(e) => setMatchSearch({ ...matchSearch, [entry.originalName]: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500" /></div>
            <div className="mt-2 max-h-[120px] overflow-y-auto space-y-0.5">{filtered.slice(0, 20).map((name) => (<button key={name} onClick={() => { const u = [...unmatchedEntries]; u[idx].selectedMatch = name; setUnmatchedEntries(u); }} className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${entry.selectedMatch === name ? "bg-green-600/20 text-green-300" : "text-gray-300 hover:bg-gray-700"}`}>{name}</button>))}{filtered.length === 0 && <p className="text-xs text-gray-600 px-3 py-2">Sonuc yok</p>}</div>
          </div>);
        })}</div>
        <div className="p-5 border-t border-gray-700 flex justify-between gap-3"><button onClick={() => setShowMatchPanel(false)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-700">Iptal</button><div className="flex gap-2"><button onClick={handleSkipMatching} className="px-4 py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600">Atlayarak Yukle</button><button onClick={handleConfirmMatches} disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-green-600 hover:bg-green-700 font-medium disabled:opacity-50 flex items-center gap-2"><Check className="w-4 h-4" /> Onayla</button></div></div>
      </div></div>)}

      {/* DATE PICKER FOR UPLOAD */}
      {showDatePicker && (<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-400" /> Tarih Araligi Secin</h2>
        <div className="space-y-3">
          <div><label className="text-xs text-gray-400 block mb-1">Donem Adi (opsiyonel)</label><input type="text" value={periodName} onChange={(e) => setPeriodName(e.target.value)} placeholder="Orn: Hafta 1" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-400 block mb-1">Baslangic</label><input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500" /></div>
            <div><label className="text-xs text-gray-400 block mb-1">Bitis</label><input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500" /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => { setShowDatePicker(false); setPeriodName(""); setPeriodStart(""); setPeriodEnd(""); }} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-700">Iptal</button>
          <button onClick={async () => {
            if (!periodStart || !periodEnd) return;
            const name = periodName || `${periodStart} - ${periodEnd}`;
            const period = await createShiftPeriod(name, periodStart, periodEnd);
            setUploadPeriodId(period.id);
            setSelectedPeriod(period.id);
            setShowDatePicker(false);
            setPeriodName(""); setPeriodStart(""); setPeriodEnd("");
            fileInputRef.current?.click();
            await fetchData();
          }} disabled={!periodStart || !periodEnd} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 font-medium disabled:opacity-50">Devam et ve Dosya Sec</button>
        </div>
      </div></div>)}

      {/* AUTO GENERATE PANEL */}
      {showAutoGen && (<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-gray-700"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center"><Wand2 className="w-5 h-5 text-purple-400" /></div><div><h2 className="text-lg font-bold">Otomatik Shift Olustur</h2><p className="text-xs text-gray-400">Claude AI ile akilli vardiya olusturma</p></div></div></div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-400 block mb-1">Baslangic Tarihi</label><input type="date" value={genStartDate} onChange={(e) => setGenStartDate(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500" /></div>
            <div><label className="text-xs text-gray-400 block mb-1">Kac Hafta</label><select value={genWeeks} onChange={(e) => setGenWeeks(Number(e.target.value))} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"><option value={1}>1 Hafta</option><option value={2}>2 Hafta</option><option value={3}>3 Hafta</option><option value={4}>4 Hafta</option></select></div>
            <div className="flex items-end"><button onClick={handleAutoGenPreview} disabled={!genStartDate || genLoading} className="w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">{genLoading ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> AI Olusturuyor...</> : <><Wand2 className="w-4 h-4" /> AI ile Olustur</>}</button></div>
          </div>
          <div><label className="text-xs text-gray-400 block mb-1">Ozel Kurallar (opsiyonel)</label><input type="text" value={genRules} onChange={(e) => setGenRules(e.target.value)} placeholder="Orn: Cuma aksami ekstra kisi, Hakan ile Asaf ayni gunde izinli olmasin..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500" /></div>
          {genUsage && <p className="text-[10px] text-gray-600">AI kullanimi: {genUsage.input} input + {genUsage.output} output token (Haiku)</p>}
          <div className="bg-gray-900/50 rounded-lg p-3 text-xs text-gray-400"><strong className="text-gray-300">AI su kurallara uyar:</strong>
            <div className="grid grid-cols-1 gap-1 mt-2">
              <div>- Rollere uygun vardiya atar (Agent: 3 shift, Admin: 2 shift, Finans/Marketing: 09-18, IT: 2 shift)</div>
              <div>- Adil dagilim, gece vardiyasi esit paylasim</div>
              <div>- Ardisik 2+ gece yok, izinler farkli gunlere</div>
              <div>- Her dilimde min 1 kisi, onceki haftayi dikkate alir</div>
              <div>- Ozel kurallarinizi da uygular</div>
            </div>
          </div>
          {genPreview.length > 0 && (<>
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Onizleme</h3>
              <div className="flex items-center gap-2"><button onClick={() => setGenPreviewWeek(Math.max(0, genPreviewWeek - 1))} disabled={genPreviewWeek === 0} className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button><span className="text-sm">Hafta {genPreviewWeek + 1} / {genWeeks}</span><button onClick={() => setGenPreviewWeek(Math.min(genWeeks - 1, genPreviewWeek + 1))} disabled={genPreviewWeek >= genWeeks - 1} className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button></div>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="bg-gray-900 border-b border-gray-700"><th className="text-left px-3 py-2">Personel</th><th className="text-left px-2 py-2">Rol</th>{DAYS_SHORT.map((d, i) => <th key={i} className="text-center px-2 py-2">{d}</th>)}</tr></thead>
              <tbody>{previewStaff.map((name) => {
                const staffShifts = weekPreviewData.filter((s) => s.staffName === name);
                const role = staffShifts[0]?.role || "agent";
                return (<tr key={name} className="border-b border-gray-700/30"><td className="px-3 py-1.5 font-medium">{name}</td><td className="px-2 py-1.5"><span className={`px-1.5 py-0.5 rounded border text-[10px] ${ROLE_COLORS[role]}`}>{STAFF_ROLES[role]?.split(" ")[0]}</span></td>
                  {DAYS_SHORT.map((_, d) => { const s = staffShifts.find((x) => x.day === d); return (<td key={d} className="px-1 py-1.5 text-center"><span className={`px-1.5 py-0.5 rounded text-[10px] ${s?.isOff ? "bg-red-600/30 text-red-300" : "bg-gray-700/50 text-gray-300"}`}>{s?.isOff ? "Izin" : s?.start && s?.end ? `${s.start.replace(":",  ".")}-${s.end.replace(":", ".")}` : "-"}</span></td>); })}
                </tr>);
              })}</tbody>
            </table></div>
          </>)}
        </div>
        <div className="p-5 border-t border-gray-700 flex justify-between"><button onClick={() => { setShowAutoGen(false); setGenPreview([]); }} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-700">Iptal</button>
          {genPreview.length > 0 && <button onClick={handleAutoGenSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-green-600 hover:bg-green-700 font-medium disabled:opacity-50 flex items-center gap-2"><Check className="w-4 h-4" /> {genWeeks} Hafta Olustur</button>}
        </div>
      </div></div>)}

      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3"><Clock className="w-6 h-6 text-blue-400" /><h1 className="text-2xl font-bold">Vardiya Yonetimi</h1></div><div className="flex items-center gap-2"><Link href="/shifts/guide" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-400 transition-colors bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-blue-600/30"><BookOpen className="w-3.5 h-3.5" /> Kilavuz</Link></div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowAutoGen(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"><Wand2 className="w-4 h-4" /> Otomatik Olustur</button>
          <button onClick={handleOpenAddStaff} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"><UserPlus className="w-4 h-4" /> Personel Ekle</button>
          <div className="relative"><button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm font-medium"><Download className="w-4 h-4" /> Indir <ChevronDown className="w-3 h-3" /></button>
            {showExportMenu && (<div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-30 min-w-[180px]">
              <button onClick={handleDownloadTemplate} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 rounded-t-lg flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-green-400" /> Sablon (.xlsx)</button>
              <button onClick={handleExportExcel} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-blue-400" /> Excel</button>
              <button onClick={handleExportCSV} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 rounded-b-lg flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-yellow-400" /> CSV</button>
            </div>)}
          </div>
          <button onClick={handleImportWithDate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"><Calendar className="w-4 h-4" /> Tarihli Yukle</button>
          <label className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"><Upload className="w-4 h-4" /> Yukle<input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt,.jpg,.jpeg,.png,.webp" onChange={handleImportChange} className="hidden" /></label>
        </div>
      </div>

      {importStatus && (<div className="bg-blue-900/30 border border-blue-700 rounded-lg px-4 py-3 text-sm text-blue-300 flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {importStatus}</div>)}

      {/* PERIOD SELECTOR */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-400" /> Donemler</h3>
          <div className="flex items-center gap-2">
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-100">
              {Object.entries(DEPARTMENT_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={() => setShowPeriodCreate(!showPeriodCreate)} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-3 h-3" /> Yeni Donem</button>
          </div>
        </div>
        {showPeriodCreate && (<div className="flex gap-2 mb-3 items-end">
          <div className="flex-1"><input type="text" placeholder="Donem adi..." value={periodName} onChange={(e) => setPeriodName(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" /></div>
          <div><select value={periodDept} onChange={(e) => setPeriodDept(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-100">{Object.entries(DEPARTMENT_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" /></div>
          <div><input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" /></div>
          <button onClick={handleCreatePeriod} disabled={!periodStart || !periodEnd} className="bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">Olustur</button>
        </div>)}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSelectedPeriod(null)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!selectedPeriod ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>Varsayilan (Genel)</button>
          {periods.map((p) => (<div key={p.id} className="flex items-center gap-1">
            <button onClick={() => { setSelectedPeriod(p.id); const dept = (p as {department?:string}).department; if (dept && dept !== "all") setDeptFilter(dept); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedPeriod === p.id ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
              {p.name || `${formatDate(p.start_date)} - ${formatDate(p.end_date)}`}
              {(p as {department?:string}).department && (p as {department?:string}).department !== "all" && <span className="ml-1 text-[9px] opacity-60">({DEPARTMENT_OPTIONS[(p as {department?:string}).department!] || ""})</span>}
            </button>
            <button onClick={() => handleDeletePeriod(p.id)} className="text-gray-600 hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
          </div>))}
        </div>
        {currentPeriod && <p className="text-xs text-gray-500 mt-2">{formatDate(currentPeriod.start_date)} - {formatDate(currentPeriod.end_date)}</p>}
      </div>

      {/* ADD STAFF */}
      {showAddStaff && (<div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-blue-400" /> Gruplardan Personel Sec</h3><div className="flex items-center gap-2">{selectedSenders.size > 0 && (<button onClick={handleAddSelected} disabled={saving} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> {selectedSenders.size} Ekle</button>)}<button onClick={() => { setShowAddStaff(false); setSelectedSenders(new Set()); }} className="text-gray-500 hover:text-gray-300 p-1"><X className="w-4 h-4" /></button></div></div>
        <div className="relative mb-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" /><input type="text" placeholder="Isim veya grup ara..." value={senderSearch} onChange={(e) => setSenderSearch(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500" autoFocus /></div>
        {loadingSenders ? (<div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" /></div>
        ) : filteredSenders.length === 0 ? (<div className="text-center py-8 text-gray-500 text-sm">{senders.length === 0 ? "Mesaj gonderen bulunamadi veya tumu eklenmis." : "Sonuc yok."}</div>
        ) : (<div className="max-h-[300px] overflow-y-auto space-y-1">{filteredSenders.map((sender) => {
          const isSel = selectedSenders.has(sender.sender_name);
          return (<button key={sender.sender_name} onClick={() => toggleSender(sender.sender_name)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left ${isSel ? "bg-blue-600/20 border border-blue-500/50 text-blue-300" : "bg-gray-900/50 border border-transparent hover:bg-gray-700/50 text-gray-300"}`}>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSel ? "border-blue-500 bg-blue-600" : "border-gray-600"}`}>{isSel && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}</div>
            <div className="flex-1 min-w-0"><div className="font-medium truncate">{sender.sender_name}</div><div className="text-xs text-gray-500 truncate">{sender.group_titles.join(", ")} - {sender.message_count} mesaj</div></div>
          </button>);
        })}</div>)}
      </div>)}

      {/* ON DUTY (only for default period) */}
      {(<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700"><h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Su An Gorevde ({onDuty.length})</h2><div className="flex flex-wrap gap-2">{onDuty.length === 0 ? <p className="text-gray-500 text-sm">Gorevde personel yok</p> : onDuty.map((sw) => { const _now = new Date(); const _tMs = _now.getTime() + 3 * 3600000; const _tt = new Date(_tMs); const dow = _tt.getUTCDay() === 0 ? 6 : _tt.getUTCDay() - 1; const shift = sw.shifts[dow]; return (<div key={sw.staff.id} className="bg-green-900/30 border border-green-700/50 rounded-lg px-3 py-2 text-sm"><span className="font-medium">{sw.staff.name}</span>{shift && <span className="text-green-400 text-xs ml-2">{formatShift(shift)}</span>}</div>); })}</div></div>
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700"><h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-500" /> Izinli / Degil ({offDuty.length})</h2><div className="flex flex-wrap gap-2">{offDuty.length === 0 ? <p className="text-gray-500 text-sm">-</p> : offDuty.map((sw) => (<div key={sw.staff.id} className="bg-gray-700/30 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-gray-400">{sw.staff.name}</div>))}</div></div>
      </div>)}{/* end on-duty */}

      {/* SHIFT TABLE */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="bg-gray-900 border-b border-gray-700">
            <th className="text-left px-4 py-3 font-semibold text-gray-300 sticky left-0 bg-gray-900 z-10 min-w-[140px]">Personel</th>
            <th className="text-center px-2 py-3 font-semibold text-gray-300 min-w-[90px]">Rol</th>
            {DAYS.map((day, i) => (<th key={i} className="text-center px-3 py-3 font-semibold text-gray-300 min-w-[110px]"><span className="hidden lg:inline">{day}</span><span className="lg:hidden">{DAYS_SHORT[i]}</span></th>))}
            <th className="text-center px-2 py-3 font-semibold text-gray-300 w-10"></th>
          </tr></thead>
          <tbody>{data.length === 0 ? (<tr><td colSpan={10} className="text-center py-12 text-gray-500">Henuz personel yok. Ekleyin veya dosya yukleyin.</td></tr>
          ) : data.map((sw) => {
            const role = (sw.staff as Staff & {role?:string}).role || "agent";
            return (<tr key={sw.staff.id} className="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors">
              <td className="px-4 py-3 font-medium sticky left-0 bg-gray-800 z-10"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${sw.staff.is_active ? "bg-green-500" : "bg-gray-600"}`} />{sw.staff.name}</div></td>
              <td className="px-2 py-2 text-center relative">
                {editingRole === sw.staff.id ? (
                  <div className="absolute top-0 left-0 z-20 bg-gray-900 border border-gray-600 rounded-lg shadow-xl p-1.5 min-w-[140px]">
                    {Object.entries(STAFF_ROLES).map(([key, label]) => (<button key={key} onClick={() => handleRoleChange(sw.staff.id, key)} className={`w-full text-left px-2 py-1 rounded text-xs hover:bg-gray-700 ${role === key ? "text-blue-400" : "text-gray-300"}`}>{label}</button>))}
                    <button onClick={() => setEditingRole(null)} className="w-full text-left px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-700">Kapat</button>
                  </div>
                ) : null}
                <button onClick={() => setEditingRole(editingRole === sw.staff.id ? null : sw.staff.id)} className={`px-2 py-1 rounded border text-[10px] font-medium cursor-pointer hover:ring-1 hover:ring-blue-500 ${ROLE_COLORS[role] || ROLE_COLORS.agent}`}>{STAFF_ROLES[role]?.split(" ").slice(0, 2).join(" ") || "Agent"}</button>
              </td>
              {DAYS.map((_, dayIdx) => {
                const shift = sw.shifts[dayIdx]; const isEditing = editCell?.staffId === sw.staff.id && editCell?.day === dayIdx;
                return (<td key={dayIdx} className="px-2 py-2 text-center relative">
                  {isEditing && (<div className="absolute top-0 left-0 z-20 bg-gray-900 border border-gray-600 rounded-lg shadow-xl p-2 min-w-[150px]"><div className="space-y-1">{SHIFT_PRESETS.map((preset) => (<button key={preset.label} onClick={() => handleShiftSelect(sw.staff.id, dayIdx, preset)} className={`w-full text-left px-3 py-1.5 rounded text-xs hover:bg-gray-700 ${preset.start === null ? "text-red-400" : "text-gray-300"}`}>{preset.label}</button>))}<button onClick={() => setEditCell(null)} className="w-full text-left px-3 py-1.5 rounded text-xs text-gray-500 hover:bg-gray-700">Kapat</button></div></div>)}
                  <button onClick={() => setEditCell(isEditing ? null : { staffId: sw.staff.id, day: dayIdx })} className={`w-full px-2 py-1.5 rounded-md text-xs font-medium cursor-pointer hover:ring-1 hover:ring-blue-500 ${getShiftColor(shift) || "bg-gray-700/30 text-gray-500"}`}>{formatShift(shift)}</button>
                </td>);
              })}
              <td className="px-2 py-2"><button onClick={() => handleDeleteStaff(sw.staff.id, sw.staff.name)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button></td>
            </tr>);
          })}</tbody>
        </table></div>
      </div>

      {saving && (<div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm z-50"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Kaydediliyor...</div>)}
    </div>
  );
}
