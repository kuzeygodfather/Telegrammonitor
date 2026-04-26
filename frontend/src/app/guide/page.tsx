"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen, LayoutDashboard, Bell, MessageSquare, Users, FileText, UserCheck,
  Clock, Settings, Terminal, Radio, LogIn, Shield, Search, Send, Eye, EyeOff,
  ChevronRight, Check, AlertTriangle, Zap, BarChart3, Download, Upload,
  Wand2, Calendar, Tag, Monitor, RefreshCw, MousePointer, HelpCircle, Key,
  ArrowLeft, ArrowRight, Activity, Target, Pin, StickyNote, Star,
  FileSpreadsheet, Image, Trash2, ChevronDown, X, Plus, Phone, KeyRound, UserPlus,
} from "lucide-react";

// ============ HELPER COMPONENTS ============

function Step({ n, icon: Icon, title, desc, color = "blue" }: { n: number; icon: React.ElementType; title: string; desc: string; color?: string }) {
  const colors: Record<string, string> = { blue: "bg-blue-600/20 text-blue-400 border-blue-600/30", green: "bg-green-600/20 text-green-400 border-green-600/30", purple: "bg-purple-600/20 text-purple-400 border-purple-600/30", orange: "bg-orange-600/20 text-orange-400 border-orange-600/30", cyan: "bg-cyan-600/20 text-cyan-400 border-cyan-600/30", red: "bg-red-600/20 text-red-400 border-red-600/30" };
  return (<div className="flex gap-4 items-start"><div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${colors[color]}`}><span className="text-sm font-bold">{n}</span></div><div className="flex-1"><div className="flex items-center gap-2 mb-1"><Icon className="w-4 h-4 text-gray-400" /><h4 className="font-semibold text-sm">{title}</h4></div><p className="text-xs text-gray-400 leading-relaxed">{desc}</p></div></div>);
}

function Info({ type = "info", children }: { type?: "info" | "warning" | "tip"; children: React.ReactNode }) {
  const s = { info: "bg-blue-900/20 border-blue-700/50 text-blue-300", warning: "bg-orange-900/20 border-orange-700/50 text-orange-300", tip: "bg-green-900/20 border-green-700/50 text-green-300" };
  const icons = { info: Zap, warning: AlertTriangle, tip: Check };
  const I = icons[type];
  return (<div className={`flex gap-3 items-start p-4 rounded-xl border ${s[type]}`}><I className="w-4 h-4 flex-shrink-0 mt-0.5" /><div className="text-xs leading-relaxed">{children}</div></div>);
}

function Feature({ icon: Icon, title, desc, color }: { icon: React.ElementType; title: string; desc: string; color: string }) {
  return (<div className="bg-gray-800 rounded-xl p-4 border border-gray-700"><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}><Icon className="w-5 h-5" /></div><h3 className="font-semibold text-sm mb-1">{title}</h3><p className="text-xs text-gray-400">{desc}</p></div>);
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (<details className="bg-gray-800 rounded-xl border border-gray-700 group"><summary className="p-4 cursor-pointer flex items-center gap-3 text-sm font-medium hover:text-blue-400 transition-colors"><HelpCircle className="w-4 h-4 text-gray-500 group-open:text-blue-400" />{q}</summary><div className="px-4 pb-4 text-xs text-gray-400 ml-7">{a}</div></details>);
}

// ============ SECTIONS ============

const NAV = [
  { id: "overview", label: "Genel Bakis", icon: Monitor },
  { id: "login", label: "Giris ve Kayit", icon: LogIn },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "alerts", label: "Uyari Merkezi", icon: Bell },
  { id: "chat", label: "Telegram Chat", icon: MessageSquare },
  { id: "groups", label: "Grup Yonetimi", icon: Users },
  { id: "reports", label: "Raporlar", icon: FileText },
  { id: "personnel", label: "Personel Takip", icon: UserCheck },
  { id: "shifts", label: "Vardiya Yonetimi", icon: Clock },
  { id: "settings", label: "Ayarlar", icon: Settings },
  { id: "logs", label: "Sistem Loglari", icon: Terminal },
  { id: "faq", label: "SSS", icon: HelpCircle },
];

export default function SystemGuidePage() {
  const [active, setActive] = useState("overview");

  const scrollTo = (id: string) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div className="flex gap-6 max-w-7xl mx-auto">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 sticky top-6 self-start hidden lg:block">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-3">
          <div className="flex items-center gap-2 px-3 mb-3 pb-3 border-b border-gray-700">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider">Sistem Kilavuzu</span>
          </div>
          <nav className="space-y-0.5">{NAV.map((s) => {
            const I = s.icon;
            return (<button key={s.id} onClick={() => scrollTo(s.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${active === s.id ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700/50 hover:text-gray-300"}`}><I className="w-3.5 h-3.5" />{s.label}</button>);
          })}</nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-12 pb-20">

        {/* ====== HEADER ====== */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600/30 to-purple-600/30 rounded-2xl flex items-center justify-center border border-blue-600/20">
            <Radio className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">TG Monitor - Sistem Kilavuzu</h1>
            <p className="text-sm text-gray-400 mt-1">Telegram Takip Paneli kullanim rehberi - tum ozellikler ve islevler</p>
          </div>
        </div>

        {/* ====== OVERVIEW ====== */}
        <section id="overview" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><Monitor className="w-5 h-5 text-blue-400" /> Genel Bakis</h2>
          <p className="text-sm text-gray-300 leading-relaxed">TG Monitor, Telegram gruplarini 7/24 izleyen, mesajlari yapay zeka ile analiz eden ve yoneticilere ozetleyen bir takip panelidir. Canli destek, finans, pazarlama ve teknik ekiplerin Telegram uzerindeki iletisimini merkezi bir panelden takip etmenizi saglar.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Feature icon={Activity} title="Canli Izleme" desc="Telegram gruplari 7/24 dinlenir, yeni mesajlar aninda islenir" color="bg-green-600/20 text-green-400" />
            <Feature icon={Wand2} title="AI Analiz" desc="Claude AI mesajlari analiz eder: duygu, kategori, oncelik, ozet" color="bg-purple-600/20 text-purple-400" />
            <Feature icon={Bell} title="Akilli Uyarilar" desc="Onemli konular otomatik tespit edilir, onceliklendirilir" color="bg-red-600/20 text-red-400" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Feature icon={MessageSquare} title="Telegram Entegrasyon" desc="Gruplardan okuma ve mesaj gonderme panelden yapilir" color="bg-blue-600/20 text-blue-400" />
            <Feature icon={Clock} title="Vardiya Planlama" desc="Personel shift yonetimi, AI ile otomatik olusturma" color="bg-orange-600/20 text-orange-400" />
            <Feature icon={Shield} title="Coklu Kullanici" desc="Her kullanicinin kendi gruplari, ayarlari ve verileri" color="bg-cyan-600/20 text-cyan-400" />
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-3">Sol Menu Yapisi</h3>
            <div className="grid grid-cols-3 gap-3 text-xs text-gray-400">
              {NAV.filter(n => n.id !== "overview" && n.id !== "faq").map(n => {
                const I = n.icon;
                return (<div key={n.id} className="flex items-center gap-2"><I className="w-4 h-4 text-gray-500" /><span><strong className="text-gray-300">{n.label}</strong></span></div>);
              })}
            </div>
          </div>
        </section>

        {/* ====== LOGIN ====== */}
        <section id="login" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><LogIn className="w-5 h-5 text-green-400" /> Giris ve Kayit</h2>
          <p className="text-sm text-gray-300">Sisteme erisim icin once kayit olmaniz, ardindan giris yapmaniz gerekir.</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2"><LogIn className="w-4 h-4 text-green-400" /> Giris</h3>
              <Step n={1} icon={KeyRound} color="green" title="Kullanici adi ve sifre gir" desc="Kayitli kullanici adiniz ve sifrenizle giris yapin." />
              <Step n={2} icon={Shield} color="green" title="2FA dogrulama (varsa)" desc="TOTP veya ek dogrulama kodu girmeniz istenebilir." />
              <Step n={3} icon={Check} color="green" title="Panele erisin" desc="Basarili giristen sonra Dashboard'a yonlendirilirsiniz." />
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2"><UserCheck className="w-4 h-4 text-blue-400" /> Kayit</h3>
              <Step n={1} icon={Plus} color="blue" title="Kayit formunu doldur" desc="Kullanici adi, sifre ve telefon numarasi girin." />
              <Step n={2} icon={Phone} color="blue" title="Telegram dogrulama" desc="Telefonunuza gelen kodu girin. Telegram hesabiniz sisteme baglanir." />
              <Step n={3} icon={Shield} color="blue" title="Admin onayi" desc="Hesabiniz admin tarafindan onaylandiktan sonra aktif olur." />
            </div>
          </div>

          <Info type="warning"><strong>Onemli:</strong> Her kullanicinin kendi Telegram session&apos;i olusturulur. Sisteme erisim yetkisi admin tarafindan verilir.</Info>
        </section>

        {/* ====== DASHBOARD ====== */}
        <section id="dashboard" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><LayoutDashboard className="w-5 h-5 text-blue-400" /> Dashboard</h2>
          <p className="text-sm text-gray-300">Ana sayfa, sistemin genel durumunu tek bakista gormenizi saglar.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-3">Istatistik Kartlari</h3>
            <div className="grid grid-cols-4 gap-3 text-xs">
              <div className="bg-blue-600/10 rounded-lg p-3 border border-blue-600/20"><MessageSquare className="w-5 h-5 text-blue-400 mb-2" /><strong className="text-gray-300">Bugunun Mesajlari</strong><p className="text-gray-500 mt-1">Son 24 saatte gelen toplam mesaj sayisi</p></div>
              <div className="bg-red-600/10 rounded-lg p-3 border border-red-600/20"><AlertTriangle className="w-5 h-5 text-red-400 mb-2" /><strong className="text-gray-300">Aktif Uyarilar</strong><p className="text-gray-500 mt-1">Okunmamis uyari sayisi</p></div>
              <div className="bg-green-600/10 rounded-lg p-3 border border-green-600/20"><Users className="w-5 h-5 text-green-400 mb-2" /><strong className="text-gray-300">Izlenen Gruplar</strong><p className="text-gray-500 mt-1">Aktif izleme olan grup sayisi</p></div>
              <div className="bg-purple-600/10 rounded-lg p-3 border border-purple-600/20"><Eye className="w-5 h-5 text-purple-400 mb-2" /><strong className="text-gray-300">Onemli Konular</strong><p className="text-gray-500 mt-1">Yoneticiyi ilgilendiren mesaj sayisi</p></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-400" /> Saatlik Grafik</h3>
              <p className="text-xs text-gray-400">Son 24 saatteki mesaj yogunlugunu saat bazinda gosteren cubuk grafik. Istanbul saatine goredir.</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Target className="w-4 h-4 text-orange-400" /> Aktif Konular</h3>
              <p className="text-xs text-gray-400">Devam eden sorunlar, onay bekleyen konular ve aksiyon gerektiren durumlar. Durum etiketleriyle (SORUN, ONAY_BEKLIYOR, AKSIYON_GEREKLI, BILGI) goruntulenir.</p>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-2">Mesaj Akisi</h3>
            <p className="text-xs text-gray-400 mb-3">Dashboard&apos;da iki mesaj listesi vardir:</p>
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
              <div><strong className="text-orange-300">Sizi Ilgilendiren Mesajlar:</strong> Oncelik 3+ veya yoneticiye ozel isaretli mesajlar. AI ozeti, duygu analizi, kategori, oncelik cubugu ve aksiyon onerisi icerir.</div>
              <div><strong className="text-gray-300">Genel Akis:</strong> Dusuk oncelikli rutin mesajlar. Kisaltilmis gorunumde grup, gonderen ve metin gosterilir.</div>
            </div>
          </div>
        </section>

        {/* ====== ALERTS ====== */}
        <section id="alerts" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><Bell className="w-5 h-5 text-red-400" /> Uyari Merkezi</h2>
          <p className="text-sm text-gray-300">AI tarafindan tespit edilen onemli konularin toplandigi ve yonetildigi merkez.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-3">Konu (Topic) Karti Yapisi</h3>
            <div className="space-y-2 text-xs text-gray-400">
              <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" /><span><strong className="text-gray-300">Baslik ve Durum:</strong> Konu basligi + durum etiketi (SORUN, ONAY_BEKLIYOR, AKSIYON_GEREKLI, BILGI)</span></div>
              <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" /><span><strong className="text-gray-300">Oncelik Cubugu:</strong> 1-5 arasi oncelik seviyesi, renkli cubuk ile gosterilir</span></div>
              <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" /><span><strong className="text-gray-300">AI Hikayesi:</strong> Sorun ozeti, kronoloji, son durum ve onerilen aksiyon</span></div>
              <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" /><span><strong className="text-gray-300">Mesaj Gecmisi:</strong> Konuyla ilgili tum Telegram mesajlari, orijinal metinleriyle</span></div>
              <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" /><span><strong className="text-gray-300">Aksiyonlar:</strong> Mesaj gonderme, not ekleme, atama yapma, sabitleme</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
              <h3 className="font-semibold text-sm">Filtreleme</h3>
              <Step n={1} icon={Search} color="red" title="Arama" desc="Konu basligi veya iceriginde arama yapin." />
              <Step n={2} icon={Tag} color="red" title="Durum filtresi" desc="SORUN, ONAY_BEKLIYOR, AKSIYON_GEREKLI, BILGI durumlarina gore filtreleyin." />
              <Step n={3} icon={Users} color="red" title="Grup filtresi" desc="Belirli bir grubun konularini gorun." />
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
              <h3 className="font-semibold text-sm">Islemler</h3>
              <Step n={1} icon={Send} color="blue" title="Mesaj Gonder" desc="Konuyla ilgili gruba dogrudan mesaj gonderin." />
              <Step n={2} icon={StickyNote} color="orange" title="Not Ekle" desc="Konuya ozel notlar ekleyin (sadece panel icerisinde gorunur)." />
              <Step n={3} icon={Pin} color="purple" title="Sabitle" desc="Onemli konulari ust siraya sabitleyin." />
            </div>
          </div>
        </section>

        {/* ====== CHAT ====== */}
        <section id="chat" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><MessageSquare className="w-5 h-5 text-blue-400" /> Telegram Chat</h2>
          <p className="text-sm text-gray-300">Telegram gruplarini dogrudan panelden goruntuleyin ve mesaj gonderin.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">Kullanim</h3>
            <Step n={1} icon={Users} color="blue" title="Sol listeden grup sec" desc="Tum Telegram gruplari sol panelde listelenir. Arama ile filtreleyebilirsiniz. Marka etiketleri (Benjabet, BIA, Dilbet, Dopamin) otomatik gosterilir." />
            <Step n={2} icon={MessageSquare} color="blue" title="Mesajlari goruntule" desc="Secilen grubun mesajlari sag panelde gosterilir. Her 5 saniyede otomatik guncellenir." />
            <Step n={3} icon={Send} color="green" title="Mesaj gonder" desc="Alt kisimdan mesaj yazin ve gonderin. Mesaj Telegram grubuna iletilir." />
          </div>

          <Info type="tip"><strong>Canli Guncelleme:</strong> Secili grubun mesajlari her 5 saniyede, grup listesi her 30 saniyede otomatik guncellenir. Manuel yenilemek icin yenile butonunu kullanin.</Info>
        </section>

        {/* ====== GROUPS ====== */}
        <section id="groups" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><Users className="w-5 h-5 text-green-400" /> Grup Yonetimi</h2>
          <p className="text-sm text-gray-300">Telegram gruplarini yonetin, izleme ayarlarini yapin ve gruba ozel kurallar belirleyin.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-3">Grup Ozellikleri</h3>
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
              <div className="space-y-2">
                <div className="flex items-center gap-2"><Eye className="w-4 h-4 text-green-400" /><span><strong className="text-gray-300">Izleme Ac/Kapat:</strong> Grubun mesajlarini izlemeyi aktif/pasif yapin</span></div>
                <div className="flex items-center gap-2"><Star className="w-4 h-4 text-yellow-400" /><span><strong className="text-gray-300">Onemli Konular:</strong> Bu grupta hangi konulara oncelik verilecegini belirtin</span></div>
                <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" /><span><strong className="text-gray-300">Aciklama:</strong> Grubun ne isi yaptigini tanimlayarak AI&apos;nin daha iyi analiz yapmasini saglayin</span></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2"><EyeOff className="w-4 h-4 text-gray-500" /><span><strong className="text-gray-300">Gormezden Gel:</strong> Belirli konulari AI analizinden disla</span></div>
                <div className="flex items-center gap-2"><Target className="w-4 h-4 text-purple-400" /><span><strong className="text-gray-300">Ilgi Alanlari:</strong> Size ozel takip konulari belirtin</span></div>
                <div className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-cyan-400" /><span><strong className="text-gray-300">Gruplari Yenile:</strong> Telegram&apos;dan en guncel grup listesini cekin</span></div>
              </div>
            </div>
          </div>

          <Info type="info"><strong>Marka Filtreleme:</strong> Gruplar otomatik olarak marka etiketleri alir (Benjabet, BIA, Dilbet, Dopamin). Ust kisimdan markaya gore filtreleyebilirsiniz.</Info>
        </section>

        {/* ====== REPORTS ====== */}
        <section id="reports" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><FileText className="w-5 h-5 text-purple-400" /> Raporlar</h2>
          <p className="text-sm text-gray-300">Mesaj istatistikleri, duygu analizi dagilimi ve en aktif gruplarin raporlarini gorun.</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700"><h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-400" /> Kategori Dagilimi</h3><p className="text-xs text-gray-400">Mesajlarin AI kategorilerine gore pasta grafik dagilimi: Sikayet, Sorun, Bilgi, Finansal, Personel, Teknik, Karar vb.</p></div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700"><h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Activity className="w-4 h-4 text-green-400" /> Duygu Analizi</h3><p className="text-xs text-gray-400">Mesajlarin duygu dagilimi: Pozitif, Negatif, Notr, Acil. Yuzde cubuklariyla gosterilir.</p></div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700"><h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-orange-400" /> En Aktif Gruplar</h3><p className="text-xs text-gray-400">En cok mesaj alan ilk 5 grup, mesaj sayilariyla listelenir.</p></div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700"><h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" /> Onemli Uyarilar</h3><p className="text-xs text-gray-400">Oncelik 3 ve uzeri uyarilar, grup basligi ve oncelik seviyesiyle listelenir.</p></div>
          </div>
        </section>

        {/* ====== PERSONNEL ====== */}
        <section id="personnel" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><UserCheck className="w-5 h-5 text-cyan-400" /> Personel Takip</h2>
          <p className="text-sm text-gray-300">Gruplardaki personellerin aktivitesini takip edin, AI destekli performans raporu alin.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">Ozellikler</h3>
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
              <div className="space-y-2">
                <div className="flex items-start gap-2"><Search className="w-4 h-4 text-cyan-400 mt-0.5" /><span><strong className="text-gray-300">Personel Listesi:</strong> Gruplarda mesaj gonderen tum kisiler, mesaj sayilari ve son aktivite tarihleriyle listelenir.</span></div>
                <div className="flex items-start gap-2"><Eye className="w-4 h-4 text-green-400 mt-0.5" /><span><strong className="text-gray-300">Izleme Baslat:</strong> Belirli bir kisinin mesajlarini ozel olarak izlemeye alin.</span></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2"><Calendar className="w-4 h-4 text-orange-400 mt-0.5" /><span><strong className="text-gray-300">Tarih Araligi:</strong> Baslangic-bitis tarihi secin.</span></div>
                <div className="flex items-start gap-2"><Wand2 className="w-4 h-4 text-purple-400 mt-0.5" /><span><strong className="text-gray-300">AI Rapor:</strong> Sectiginiz kisilerin belirli tarihteki mesajlarini AI ile analiz ettirin. Ozel prompt yazabilirsiniz.</span></div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">AI Rapor Olusturma</h3>
            <Step n={1} icon={Check} color="cyan" title="Personel sec" desc="Checkbox ile bir veya birden fazla personel secin." />
            <Step n={2} icon={Calendar} color="cyan" title="Tarih araligi belirle" desc="Hangi gunler icin rapor istediginizi secin." />
            <Step n={3} icon={FileText} color="cyan" title="Prompt yaz (opsiyonel)" desc="AI'ya ozel talimat verin. Ornegin: 'Bu kisinin musteri sikayetlerine nasil yaklastigini analiz et.'" />
            <Step n={4} icon={Wand2} color="purple" title="Rapor olustur" desc="AI, secilen kisinin belirtilen tarihlerdeki tum mesajlarini analiz eder ve rapor uretir." />
          </div>
        </section>

        {/* ====== SHIFTS ====== */}
        <section id="shifts" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><Clock className="w-5 h-5 text-orange-400" /> Vardiya Yonetimi</h2>
          <p className="text-sm text-gray-300">Personel vardiyalarini planlama, takip ve otomatik olusturma modulu.</p>
          <Info type="tip"><strong>Detayli kilavuz:</strong> Vardiya yonetimi icin kapsamli adim adim kilavuz <Link href="/shifts/guide" className="text-blue-400 underline hover:text-blue-300">Vardiya Kilavuzu</Link> sayfasinda mevcuttur.</Info>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Feature icon={UserPlus} title="Gruptan Personel Sec" desc="Telegram gruplarindaki kisilerden personel ekleyin" color="bg-green-600/20 text-green-400" />
            <Feature icon={Tag} title="Rol Ata" desc="5 farkli rol: Agent, Admin, Finans, Marketing, IT" color="bg-purple-600/20 text-purple-400" />
            <Feature icon={MousePointer} title="Tikla Duzenle" desc="Hucreye tiklayip hazir vardiya seceneklerinden secin" color="bg-blue-600/20 text-blue-400" />
            <Feature icon={FileSpreadsheet} title="Excel / CSV" desc="Sablon indirin, doldurun, yukleyin. Drag-drop destekli" color="bg-yellow-600/20 text-yellow-400" />
            <Feature icon={Image} title="Resim ile Yukle" desc="Vardiya tablosu resmini AI okur ve otomatik isler" color="bg-cyan-600/20 text-cyan-400" />
            <Feature icon={Wand2} title="AI Shift Olustur" desc="Claude AI rollere gore optimize vardiya cizelgesi olusturur" color="bg-purple-600/20 text-purple-400" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Calendar className="w-4 h-4 text-orange-400" /> Donem Sistemi</h3>
              <p className="text-xs text-gray-400">Vardiyalari haftalik donemlere ayirin. Gecmis ve gelecek planlari saklayabilirsiniz. Bugunun tarihi hangi doneme dusuyorsa, gorevde kartlari o donemin vardiyalarini kullanir.</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Search className="w-4 h-4 text-orange-400" /> Otomatik Eslestirme</h3>
              <p className="text-xs text-gray-400">Dosya yuklendiginde isimler otomatik eslestirilir. Eslesmeyen isimler icin popup acilir, siz dogru kisiyi secersiniz.</p>
            </div>
          </div>
        </section>

        {/* ====== SETTINGS ====== */}
        <section id="settings" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><Settings className="w-5 h-5 text-gray-400" /> Ayarlar</h2>
          <p className="text-sm text-gray-300">Anahtar kelime yonetimi ve sistem konfigurasyonu.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">Anahtar Kelime Yonetimi</h3>
            <p className="text-xs text-gray-400 mb-3">Sistem, mesajlarda bu kelimeleri arar ve eslesenleri isaretler. Kategorilere ayrilmistir:</p>
            <div className="grid grid-cols-4 gap-3 text-xs">
              <div className="bg-gray-900 rounded-lg p-3"><strong className="text-red-300">Sorun</strong><p className="text-gray-500 mt-1">sikayet, problem, hata, ariza, acil...</p></div>
              <div className="bg-gray-900 rounded-lg p-3"><strong className="text-blue-300">Marka</strong><p className="text-gray-500 mt-1">Sirkete ozel marka isimleri</p></div>
              <div className="bg-gray-900 rounded-lg p-3"><strong className="text-purple-300">Kisi</strong><p className="text-gray-500 mt-1">patron, yonetici gibi kisi referanslari</p></div>
              <div className="bg-gray-900 rounded-lg p-3"><strong className="text-gray-300">Ozel</strong><p className="text-gray-500 mt-1">Kullanicinin ekledigi ozel kelimeler</p></div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">Kelime Islemleri</h3>
            <Step n={1} icon={Plus} color="green" title="Yeni kelime ekle" desc="Metin kutusuna yazip kategori secin, 'Ekle' butonuna tiklayin." />
            <Step n={2} icon={EyeOff} color="orange" title="Devre disi birak" desc="Toggle butonu ile kelimeyi gecici olarak devre disi birakin (silinmez)." />
            <Step n={3} icon={Trash2} color="red" title="Sil" desc="Cop kutusu ikonu ile kelimeyi kalici olarak silin." />
          </div>
        </section>

        {/* ====== LOGS ====== */}
        <section id="logs" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><Terminal className="w-5 h-5 text-green-400" /> Sistem Loglari</h2>
          <p className="text-sm text-gray-300">Backend servislerinin canlI loglarini ve sistem durumunu izleyin.</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold text-sm mb-3">Log Goruntuleyici</h3>
              <div className="text-xs text-gray-400 space-y-2">
                <div className="flex items-center gap-2"><Terminal className="w-4 h-4 text-green-400" /><span><strong className="text-gray-300">Backend Loglari:</strong> Telegram dinleyici ve mesaj isleme loglari</span></div>
                <div className="flex items-center gap-2"><Wand2 className="w-4 h-4 text-purple-400" /><span><strong className="text-gray-300">Analyzer Loglari:</strong> AI analiz islemleri ve sonuclari</span></div>
                <div className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-blue-400" /><span><strong className="text-gray-300">Otomatik Yenileme:</strong> Loglar her 10 saniyede guncellenir</span></div>
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold text-sm mb-3">Sistem Durumu</h3>
              <div className="text-xs text-gray-400 space-y-2">
                <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-green-400" /><span><strong className="text-gray-300">Servis Durumu:</strong> Backend ve Setup servislerinin aktif/pasif durumu</span></div>
                <div className="flex items-center gap-2"><Monitor className="w-4 h-4 text-blue-400" /><span><strong className="text-gray-300">Disk/RAM:</strong> Sunucu disk ve bellek kullanim bilgileri</span></div>
                <div className="flex items-center gap-2"><Users className="w-4 h-4 text-orange-400" /><span><strong className="text-gray-300">Session&apos;lar:</strong> Aktif Telegram session sayisi ve listesi</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* ====== FAQ ====== */}
        <section id="faq" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3"><HelpCircle className="w-5 h-5 text-yellow-400" /> Sik Sorulan Sorular</h2>
          <div className="space-y-3">
            <FAQ q="Sistem nasil calisir?" a="Telegram hesabiniz uzerinden gruplardaki mesajlar okunur, Claude AI ile analiz edilir, onemli konular uyari olarak panele duser. Tum islem otomatiktir, siz sadece panelden takip edersiniz." />
            <FAQ q="Mesajlarim okunuyor mu?" a="Sistem sadece izlemeye aldiginiz gruplardaki mesajlari okur. Kisisel mesajlariniz veya izlenmeyen gruplar erisemez." />
            <FAQ q="AI analizi ne kadar surer?" a="Mesajlar batch halinde islenir. Genellikle 10-30 saniye icinde analiz tamamlanir ve uyarilar olusturulur." />
            <FAQ q="Telegram hesabima bir sey olur mu?" a="Hayir. Sistem sadece okuma yapar ve sizin gondermek istediginiz mesajlari iletir. Otomatik mesaj gondermez." />
            <FAQ q="Gruplari nasil eklerim?" a="Kayit sirasinda Telegram hesabiniz baglanir ve uye oldugunuz tum gruplar otomatik listelenir. Gruplar sayfasindan izleme ac/kapat yapabilirsiniz." />
            <FAQ q="AI shift olusturma ne kadar ucrete?" a="Claude Haiku modeli kullanilir. 10 personel, 1 hafta icin yaklasik $0.002 (0.2 cent). Ayda 4 hafta = $0.01. Cok dusuk maliyetli." />
            <FAQ q="Birden fazla kullanici ayni sistemi kullanabilir mi?" a="Evet. Her kullanicinin kendi Telegram session'i, gruplari ve verileri vardir. Admin panelden yeni kullanicilar ekleyebilir." />
            <FAQ q="Backend durarsa ne olur?" a="Loglar sayfasindan servis durumunu kontrol edin. Servisler otomatik yeniden baslar. Sorun devam ederse sunucuya erisip servisleri manuel baslatabilirsiniz." />
            <FAQ q="Verilerim nerede saklanir?" a="Tum veriler Supabase (PostgreSQL) veritabaninda saklanir. Guvenli ve yedekli bir altyapidadir." />
            <FAQ q="Canli baglanti ne demek?" a="Sag ust kosedeki yesil/sari nokta, WebSocket baglantisini gosterir. Yesil = canli, Sari = baglanti kuruluyor. Canli baglantida yeni uyarilar aninda panele duser." />
          </div>
        </section>

        {/* Footer */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
          <Radio className="w-8 h-8 text-blue-400 mx-auto mb-3" />
          <h3 className="font-bold text-lg mb-1">TG Monitor v1.0</h3>
          <p className="text-xs text-gray-500">Telegram Takip Paneli - Sistem Kullanim Kilavuzu</p>
        </div>

      </div>
    </div>
  );
}
