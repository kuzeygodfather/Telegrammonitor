"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen, Clock, UserPlus, Upload, Download, Wand2, Calendar, Search,
  FileSpreadsheet, Image, Trash2, ChevronDown, ChevronRight, Check,
  ArrowLeft, MousePointer, Tag, Users, AlertCircle, HelpCircle,
  Monitor, Zap, Shield, BarChart3, RefreshCw, Settings,
} from "lucide-react";

const sections = [
  { id: "overview", label: "Genel Bakis", icon: Monitor },
  { id: "staff", label: "Personel Yonetimi", icon: Users },
  { id: "roles", label: "Rol Sistemi", icon: Tag },
  { id: "shifts", label: "Vardiya Duzenleme", icon: Clock },
  { id: "periods", label: "Donem Yonetimi", icon: Calendar },
  { id: "import", label: "Dosya Yukleme", icon: Upload },
  { id: "image", label: "Resim ile Yukleme", icon: Image },
  { id: "export", label: "Disa Aktarma", icon: Download },
  { id: "matching", label: "Otomatik Eslestirme", icon: Search },
  { id: "ai", label: "AI Shift Olusturma", icon: Wand2 },
  { id: "onduty", label: "Gorevde Takip", icon: Zap },
  { id: "tips", label: "Ipuclari", icon: Settings },
];

function StepCard({ step, title, desc, icon: Icon, color = "blue" }: { step: number; title: string; desc: string; icon: React.ElementType; color?: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-600/20 text-blue-400 border-blue-600/30",
    green: "bg-green-600/20 text-green-400 border-green-600/30",
    purple: "bg-purple-600/20 text-purple-400 border-purple-600/30",
    orange: "bg-orange-600/20 text-orange-400 border-orange-600/30",
    cyan: "bg-cyan-600/20 text-cyan-400 border-cyan-600/30",
  };
  return (
    <div className="flex gap-4 items-start">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <span className="text-sm font-bold">{step}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 text-gray-400" />
          <h4 className="font-semibold text-sm">{title}</h4>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function ButtonDemo({ icon: Icon, label, color = "bg-gray-700" }: { icon: React.ElementType; label: string; color?: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-600" style={{ pointerEvents: "none" }}>
      <div className={`w-6 h-6 ${color} rounded flex items-center justify-center`}><Icon className="w-3.5 h-3.5 text-white" /></div>
      <span>{label}</span>
    </div>
  );
}

function ShiftCell({ text, color }: { text: string; color: string }) {
  return <span className={`px-2 py-1 rounded-md text-[10px] font-medium ${color}`}>{text}</span>;
}

function InfoBox({ type = "info", children }: { type?: "info" | "warning" | "tip"; children: React.ReactNode }) {
  const styles = {
    info: "bg-blue-900/20 border-blue-700/50 text-blue-300",
    warning: "bg-orange-900/20 border-orange-700/50 text-orange-300",
    tip: "bg-green-900/20 border-green-700/50 text-green-300",
  };
  const icons = { info: AlertCircle, warning: AlertCircle, tip: Zap };
  const Icon = icons[type];
  return (
    <div className={`flex gap-3 items-start p-4 rounded-xl border ${styles[type]}`}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );
}

export default function GuidePage() {
  const [activeSection, setActiveSection] = useState("overview");

  return (
    <div className="flex gap-6 max-w-7xl mx-auto">
      {/* Sidebar Navigation */}
      <div className="w-56 flex-shrink-0 sticky top-6 self-start">
        <Link href="/shifts" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Vardiyalara Don
        </Link>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 mb-2">Kilavuz</h3>
          <nav className="space-y-0.5">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => { setActiveSection(s.id); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" }); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left ${activeSection === s.id ? "bg-blue-600/10 text-blue-400" : "text-gray-400 hover:bg-gray-700/50 hover:text-gray-300"}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {s.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-10 pb-20">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-600/20 rounded-2xl flex items-center justify-center border border-blue-600/30">
            <BookOpen className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Vardiya Yonetimi Kilavuzu</h1>
            <p className="text-sm text-gray-400 mt-1">Tum ozelliklerin detayli anlatimi ve kullanim rehberi</p>
          </div>
        </div>

        {/* ==================== OVERVIEW ==================== */}
        <section id="overview" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Monitor className="w-5 h-5 text-blue-400" /> Genel Bakis
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            Vardiya Yonetimi modulu, personel calismalarini planlama, takip etme ve raporlama islemlerini tek bir panelden yapmanizi saglar. Telegram gruplarindaki gercek personellerle entegre calisir.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Users, title: "Personel Yonetimi", desc: "Gruplardaki kisilerden personel secin, roller atayin", color: "bg-green-600/20 text-green-400" },
              { icon: Clock, title: "Vardiya Planlama", desc: "Excel, CSV, resim veya AI ile vardiya olusturun", color: "bg-blue-600/20 text-blue-400" },
              { icon: Zap, title: "Canli Takip", desc: "Su an kim gorevde, kim izinli anlik gorun", color: "bg-orange-600/20 text-orange-400" },
            ].map((item) => (
              <div key={item.title} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}><item.icon className="w-5 h-5" /></div>
                <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-3">Sayfa Yapisi</h3>
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-400">
              <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" /><span><strong className="text-gray-300">Ust Bar:</strong> Personel ekleme, dosya yukle/indir, AI olustur butonlari</span></div>
              <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" /><span><strong className="text-gray-300">Donem Paneli:</strong> Tarih araliklarina gore farkli haftalari gorun</span></div>
              <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" /><span><strong className="text-gray-300">Gorevde Kartlari:</strong> Anlik gorevde/izinli personel</span></div>
              <div className="flex items-start gap-2"><span className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" /><span><strong className="text-gray-300">Vardiya Tablosu:</strong> Personel x Gun matrisi, tikla-duzenle</span></div>
            </div>
          </div>
        </section>

        {/* ==================== STAFF ==================== */}
        <section id="staff" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Users className="w-5 h-5 text-green-400" /> Personel Yonetimi
          </h2>
          <p className="text-sm text-gray-300">Personeller, Telegram gruplarinizdaki gercek kisilerden secilir. Gruplarda mesaj gonderen herkes listeye dahildir.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
            <h3 className="font-semibold text-sm">Personel Ekleme Adimlari</h3>
            <StepCard step={1} icon={MousePointer} color="green" title="Personel Ekle butonuna tikla" desc="Sayfanin ust kismindaki yesil 'Personel Ekle' butonuna tiklayin." />
            <StepCard step={2} icon={Search} color="blue" title="Kisi ara ve sec" desc="Izlenen gruplardaki tum mesaj gonderenler listelenir. Arama kutusuna isim veya grup adi yazarak filtreleyin. Checkbox ile birden fazla kisi secebilirsiniz." />
            <StepCard step={3} icon={Check} color="green" title="Secilenleri ekle" desc="'X Kisi Ekle' butonuna tiklayarak sectiginiz kisileri personel listesine ekleyin." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><UserPlus className="w-4 h-4 text-green-400" /> Personel Bilgileri</h4>
              <ul className="text-xs text-gray-400 space-y-1.5">
                <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500" /> <strong className="text-gray-300">Aktif:</strong> Vardiya atanabilir</li>
                <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-500" /> <strong className="text-gray-300">Pasif:</strong> Gorevde listesinde gosterilmez</li>
                <li>Her personelin bir <strong className="text-gray-300">adi</strong> ve <strong className="text-gray-300">rolu</strong> vardir</li>
                <li>Gruplardaki mesaj sayisi ve hangi gruptan oldugu gosterilir</li>
              </ul>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-400" /> Personel Silme</h4>
              <ul className="text-xs text-gray-400 space-y-1.5">
                <li>Tablodaki son sutundaki <strong className="text-red-400">cop kutusu</strong> ikonuna tiklayin</li>
                <li>Onay penceresi cikar, onaylayin</li>
                <li>Personel ve tum vardiyalari silinir</li>
                <li className="text-orange-400">Dikkat: Bu islem geri alinamaz!</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ==================== ROLES ==================== */}
        <section id="roles" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Tag className="w-5 h-5 text-purple-400" /> Rol Sistemi
          </h2>
          <p className="text-sm text-gray-300">Her personele bir rol atanir. Roller, AI shift olusturmada ve raporlamada kullanilir.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-4">Mevcut Roller</h3>
            <div className="space-y-3">
              {[
                { key: "agent", label: "Canli Destek Agent", color: "bg-blue-600/20 text-blue-300 border-blue-600/30", desc: "7/24 canli destek. 3 vardiya arasinda doner (00-08, 08-16, 16-00). Haftada 2 izin." },
                { key: "admin", label: "Canli Destek Admin", color: "bg-purple-600/20 text-purple-300 border-purple-600/30", desc: "Destek yoneticisi. 2 vardiya (08-16, 12-20). Haftada 2 izin." },
                { key: "finans", label: "Finans", color: "bg-green-600/20 text-green-300 border-green-600/30", desc: "Finans ekibi. Sabit 09:00-18:00. Haftada 2 izin (genellikle Ct-Pz)." },
                { key: "marketing", label: "Marketing", color: "bg-orange-600/20 text-orange-300 border-orange-600/30", desc: "Pazarlama ekibi. Sabit 09:00-18:00. Haftada 2 izin." },
                { key: "it", label: "IT Ekibi", color: "bg-cyan-600/20 text-cyan-300 border-cyan-600/30", desc: "Teknik destek. 2 vardiya (08-16, 16-00). Haftada 1 izin." },
              ].map((r) => (
                <div key={r.key} className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-lg border text-xs font-medium min-w-[160px] text-center ${r.color}`}>{r.label}</span>
                  <span className="text-xs text-gray-400">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">Rol Degistirme</h3>
            <StepCard step={1} icon={MousePointer} color="purple" title="Tabloda 'Rol' sutunundaki etikete tikla" desc="Her personelin yaninda renkli bir rol etiketi vardir. Bu etikete tiklayin." />
            <StepCard step={2} icon={Check} color="purple" title="Yeni rolu sec" desc="Acilan listeden uygun rolu secin. Degisiklik aninda kaydedilir." />
          </div>
        </section>

        {/* ==================== SHIFTS ==================== */}
        <section id="shifts" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Clock className="w-5 h-5 text-blue-400" /> Vardiya Duzenleme
          </h2>
          <p className="text-sm text-gray-300">Tablodaki herhangi bir hucreye tiklayarak o gun icin vardiya atayabilirsiniz.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">Hucre Duzenleme</h3>
            <StepCard step={1} icon={MousePointer} color="blue" title="Hucreye tikla" desc="Tabloda degistirmek istediginiz personel-gun kesisimindeki hucreye tiklayin." />
            <StepCard step={2} icon={Clock} color="blue" title="Vardiya sec" desc="Acilan menudan hazir vardiya seceneklerinden birini secin." />

            <div className="bg-gray-900 rounded-lg p-4 mt-3">
              <h4 className="text-xs font-semibold text-gray-400 mb-3">Hazir Vardiya Secenekleri</h4>
              <div className="grid grid-cols-4 gap-2">
                <ShiftCell text="00:00-08:00" color="bg-indigo-600/20 text-indigo-300" />
                <ShiftCell text="08:00-16:00" color="bg-green-600/20 text-green-300" />
                <ShiftCell text="09:00-18:00" color="bg-green-600/20 text-green-300" />
                <ShiftCell text="12:00-20:00" color="bg-yellow-600/20 text-yellow-300" />
                <ShiftCell text="16:00-00:00" color="bg-purple-600/20 text-purple-300" />
                <ShiftCell text="20:00-04:00" color="bg-purple-600/20 text-purple-300" />
                <ShiftCell text="Izin" color="bg-red-600/30 text-red-300" />
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-3">Renk Kodlari</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-indigo-600/30" /><span className="text-gray-300">Gece Vardiyasi (00:00-08:00)</span></div>
              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-green-600/30" /><span className="text-gray-300">Sabah Vardiyasi (08:00-12:00)</span></div>
              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-yellow-600/30" /><span className="text-gray-300">Ogle Vardiyasi (12:00-16:00)</span></div>
              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-purple-600/30" /><span className="text-gray-300">Aksam Vardiyasi (16:00+)</span></div>
              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-red-600/30" /><span className="text-gray-300">Izin Gunu</span></div>
              <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-gray-700/30" /><span className="text-gray-300">Atanmamis</span></div>
            </div>
          </div>
        </section>

        {/* ==================== PERIODS ==================== */}
        <section id="periods" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Calendar className="w-5 h-5 text-orange-400" /> Donem Yonetimi
          </h2>
          <p className="text-sm text-gray-300">Vardiyalari haftalik donemlere ayirarak gecmis ve gelecek planlari saklayabilirsiniz.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">Donem Islemleri</h3>
            <StepCard step={1} icon={Calendar} color="orange" title="Yeni Donem olustur" desc="Donemler panelindeki 'Yeni Donem' butonuna tiklayin. Donem adi, baslangic ve bitis tarihi girin." />
            <StepCard step={2} icon={MousePointer} color="orange" title="Donem sec" desc="Donemler arasinda tiklayarak gecis yapin. Secili donemin vardiyalari tabloda gosterilir." />
            <StepCard step={3} icon={RefreshCw} color="blue" title="Varsayilan (Genel)" desc="Tarihsiz genel vardiya tablosu. Herhangi bir doneme atanmamis vardiyalar burada gosterilir." />
          </div>

          <InfoBox type="info">
            <strong>Otomatik Donem Tespiti:</strong> Gorevde/izinli kartlari, bugunun tarihini kapsayan bir donem varsa o donemin vardiyalarini kullanir. Yoksa varsayilan tabloyu kullanir.
          </InfoBox>
        </section>

        {/* ==================== IMPORT ==================== */}
        <section id="import" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Upload className="w-5 h-5 text-blue-400" /> Dosya Yukleme
          </h2>
          <p className="text-sm text-gray-300">Excel (.xlsx), CSV veya resim dosyalari yukleyerek toplu vardiya girisi yapabilirsiniz.</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-400" /> Tarihli Yukleme (Onerilen)</h3>
              <StepCard step={1} icon={Calendar} color="blue" title="'Tarihli Yukle' butonuna tikla" desc="Mavi renkteki 'Tarihli Yukle' butonuna tiklayin." />
              <StepCard step={2} icon={Calendar} color="blue" title="Tarih araligi sec" desc="Donem adi (opsiyonel), baslangic ve bitis tarihini girin." />
              <StepCard step={3} icon={Upload} color="blue" title="Dosya sec" desc="Excel, CSV veya resim dosyanizi secin." />
              <StepCard step={4} icon={Check} color="green" title="Eslestir ve kaydet" desc="Eslestirme paneli cikarsa isimleri eslestirin, onaylayin." />
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Upload className="w-4 h-4 text-gray-400" /> Hizli Yukleme</h3>
              <StepCard step={1} icon={Upload} color="cyan" title="'Yukle' butonuna tikla" desc="Gri renkteki 'Yukle' butonuna tiklayin." />
              <StepCard step={2} icon={FileSpreadsheet} color="cyan" title="Dosya sec" desc="Dosyanizi secin. Varsayilan (genel) doneme kaydedilir." />
              <InfoBox type="tip">
                <strong>Surukle-Birak:</strong> Dosyayi dogrudan sayfanin uzerine surukleyip birakin. Ayni sekilde calisir.
              </InfoBox>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-3">Desteklenen Dosya Formatlari</h3>
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
              <div>
                <h4 className="text-gray-300 font-medium mb-2">Excel / CSV Format</h4>
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-[10px] leading-relaxed">
                  <div className="text-green-400">Personel, Pazartesi, Sali, ..., Pazar</div>
                  <div>Hizir, 00.00-08.00, 00.00-08.00, ..., Izin</div>
                  <div>Hakan, Izin, 08.00-16.00, ..., 08.00-16.00</div>
                </div>
              </div>
              <div>
                <h4 className="text-gray-300 font-medium mb-2">Kabul Edilen Saat Formatlari</h4>
                <ul className="space-y-1">
                  <li><code className="bg-gray-900 px-1.5 py-0.5 rounded">08.00-16.00</code> (noktali)</li>
                  <li><code className="bg-gray-900 px-1.5 py-0.5 rounded">08:00-16:00</code> (iki noktali)</li>
                  <li><code className="bg-gray-900 px-1.5 py-0.5 rounded">Izin</code> veya <code className="bg-gray-900 px-1.5 py-0.5 rounded">izin</code></li>
                  <li><code className="bg-gray-900 px-1.5 py-0.5 rounded">-</code> (bos/atanmamis)</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== IMAGE ==================== */}
        <section id="image" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Image className="w-5 h-5 text-cyan-400" /> Resim ile Yukleme
          </h2>
          <p className="text-sm text-gray-300">Vardiya tablosunun ekran goruntusunu veya fotografini yukleyerek AI ile otomatik okutabilirsiniz.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">Nasil Calisir?</h3>
            <StepCard step={1} icon={Image} color="cyan" title="Resmi yukle" desc="'Yukle' veya 'Tarihli Yukle' butonuyla .jpg, .png veya .webp dosyasi secin. Ya da sayfaya surukle-birak yapin." />
            <StepCard step={2} icon={Wand2} color="purple" title="AI analiz eder" desc="Claude Haiku modeli resmi okur, tablodaki personel isimlerini ve vardiya saatlerini cikarir." />
            <StepCard step={3} icon={Search} color="orange" title="Eslestirme" desc="Resimdeki isimler, gruptaki personellerle otomatik eslestirilir. Eslesmeyen varsa size sorulur." />
            <StepCard step={4} icon={Check} color="green" title="Kaydet" desc="Eslestirmeleri onaylayin, vardiyalar kaydedilir." />
          </div>

          <InfoBox type="tip">
            <strong>En iyi sonuc icin:</strong> Net, okunaklI ekran goruntuleri kullanin. Tablonun tamami gorunur olmali. Bulanik veya egik fotograflar hataya neden olabilir.
          </InfoBox>

          <InfoBox type="info">
            <strong>Maliyet:</strong> Her resim islemi yaklasik 2000 token harcar. Claude Haiku ile islenir - cok dusuk maliyetli (~$0.005/resim).
          </InfoBox>
        </section>

        {/* ==================== EXPORT ==================== */}
        <section id="export" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Download className="w-5 h-5 text-yellow-400" /> Disa Aktarma
          </h2>
          <p className="text-sm text-gray-300">&apos;Indir&apos; butonundan 3 secenek vardir:</p>

          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: FileSpreadsheet, title: "Ornek Sablon (.xlsx)", desc: "Bos sablonu indirin, doldurun, tekrar yukleyin. Ilk defa kullaniyorsaniz buradan baslayin.", color: "text-green-400" },
              { icon: FileSpreadsheet, title: "Excel (.xlsx)", desc: "Mevcut vardiya tablosunu Excel dosyasi olarak indirin. Duzenleyip tekrar yukleyebilirsiniz.", color: "text-blue-400" },
              { icon: FileSpreadsheet, title: "CSV", desc: "Mevcut tabloyu CSV olarak indirin. Daha basit programlarla acilabilir.", color: "text-yellow-400" },
            ].map((item) => (
              <div key={item.title} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <item.icon className={`w-8 h-8 ${item.color} mb-3`} />
                <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ==================== MATCHING ==================== */}
        <section id="matching" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Search className="w-5 h-5 text-orange-400" /> Otomatik Eslestirme
          </h2>
          <p className="text-sm text-gray-300">Dosya yuklendiginde, isimleri mevcut personel ve grup uyeleriyle otomatik eslestirir.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-4">
            <h3 className="font-semibold text-sm">Eslestirme Sureci</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="bg-green-600/20 text-green-300 px-3 py-1.5 rounded-lg border border-green-600/30 font-medium">Tam Eslesme</span>
                <ArrowLeft className="w-4 h-4 text-gray-600 rotate-180" />
                <span className="text-gray-400">Dosyadaki isim = Sistemdeki isim (otomatik uygulanir)</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="bg-blue-600/20 text-blue-300 px-3 py-1.5 rounded-lg border border-blue-600/30 font-medium">Kismi Eslesme</span>
                <ArrowLeft className="w-4 h-4 text-gray-600 rotate-180" />
                <span className="text-gray-400">Isim birbirini iciyor (orn: &quot;Hakan&quot; ↔ &quot;Hakan Yilmaz&quot;) - otomatik</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="bg-orange-600/20 text-orange-300 px-3 py-1.5 rounded-lg border border-orange-600/30 font-medium">Eslesmedi</span>
                <ArrowLeft className="w-4 h-4 text-gray-600 rotate-180" />
                <span className="text-gray-400">Popup acilir, siz elle eslestirirsiniz veya yeni personel olarak eklenir</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">Eslestirme Paneli Kullanimi</h3>
            <StepCard step={1} icon={HelpCircle} color="orange" title="Eslesmeyenler gosterilir" desc="Her eslesmemiş isim icin bir kart acilir. Varsa oneri gosterilir." />
            <StepCard step={2} icon={Search} color="blue" title="Arama kutusundan bul" desc="Her karttaki arama kutusuna yazarak grup uyelerinden dogru kisiyi bulun." />
            <StepCard step={3} icon={MousePointer} color="blue" title="Dogru kisiyi sec" desc="Listeden kisiyi tiklayarak eslestirmeyi yapin. Yesil tik ile onaylanir." />
            <StepCard step={4} icon={Check} color="green" title="Onayla veya Atla" desc="'Onayla' ile eslestirmeleri uygulayip kaydedin. 'Atlayarak Yukle' ile eslesmeyenler yeni personel olarak eklenir." />
          </div>
        </section>

        {/* ==================== AI ==================== */}
        <section id="ai" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Wand2 className="w-5 h-5 text-purple-400" /> AI ile Shift Olusturma
          </h2>
          <p className="text-sm text-gray-300">Claude AI, personel rollerine, gecmis vardiyalara ve ozel kurallara gore optimize edilmis vardiya cizelgesi olusturur.</p>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 space-y-3">
            <h3 className="font-semibold text-sm">Kullanim Adimlari</h3>
            <StepCard step={1} icon={Wand2} color="purple" title="'Otomatik Olustur' butonuna tikla" desc="Mor renkteki butona tiklayin. AI olusturma paneli acilir." />
            <StepCard step={2} icon={Calendar} color="purple" title="Baslangic tarihi ve sure sec" desc="Vardiyanin baslayacagi tarihi secin. 1-4 hafta arasinda sure belirleyin." />
            <StepCard step={3} icon={Settings} color="cyan" title="Ozel kurallar yaz (opsiyonel)" desc="Ozel isteklerinizi yazin. Ornekler asagida." />
            <StepCard step={4} icon={Wand2} color="purple" title="'AI ile Olustur' tikla" desc="AI birkas saniye icinde optimize edilmis vardilayi olusturur." />
            <StepCard step={5} icon={BarChart3} color="blue" title="Onizlemeyi kontrol et" desc="Hafta hafta gezinerek vardiylari kontrol edin. Ok tuslariyla hafta degistirin." />
            <StepCard step={6} icon={Check} color="green" title="Onayla" desc="'X Hafta Olustur' butonuna tiklayin. Her hafta icin ayri donem olusturulur." />
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-3">Ornek Ozel Kurallar</h3>
            <div className="space-y-2 text-xs">
              {[
                "Cuma aksami ekstra 1 kisi calistir",
                "Hakan ile Asaf ayni gunde izinli olmasin",
                "Toprak sadece gunduz vardiasinda calissin",
                "Haftasonlari minimum 3 agent olsun",
                "Hande ve Defne ardisik izin kullanabilir",
                "IT ekibi Pazar gunu izinli olsun",
              ].map((rule) => (
                <div key={rule} className="flex items-center gap-2">
                  <ChevronRight className="w-3 h-3 text-purple-400" />
                  <code className="bg-gray-900 px-2 py-1 rounded text-gray-300">{rule}</code>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="font-semibold text-sm mb-3">AI Kurallari</h3>
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-400">
              <div className="flex items-start gap-2"><Check className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" /><span>Rollere uygun vardiya tipi atar</span></div>
              <div className="flex items-start gap-2"><Check className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" /><span>Gece vardiyasini adil dagitir</span></div>
              <div className="flex items-start gap-2"><Check className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" /><span>Ardisik 2+ gece vardiyasi vermez</span></div>
              <div className="flex items-start gap-2"><Check className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" /><span>Izin gunlerini farkli gunlere yayar</span></div>
              <div className="flex items-start gap-2"><Check className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" /><span>Her vardiya diliminde min 1 kisi birakir</span></div>
              <div className="flex items-start gap-2"><Check className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" /><span>Onceki haftayi analiz edip rotasyon yapar</span></div>
            </div>
          </div>

          <InfoBox type="info">
            <strong>Maliyet:</strong> Claude Haiku kullanilir. 10 personel, 1 hafta ≈ 2000 token ≈ <strong>$0.002</strong> (0.2 cent). 4 hafta ≈ $0.01. Cok dusuk maliyetli.
          </InfoBox>
        </section>

        {/* ==================== ON DUTY ==================== */}
        <section id="onduty" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Zap className="w-5 h-5 text-green-400" /> Gorevde Takip
          </h2>
          <p className="text-sm text-gray-300">Sayfanin ust kismindaki kartlar, su anda kimin gorevde oldugunu gosterir.</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Su An Gorevde
              </h3>
              <p className="text-xs text-gray-400 mb-3">Istanbul saatine gore su an vardiya saatleri icinde olan personeller.</p>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>- Yesil kutucukta isim ve vardiya saati gosterilir</li>
                <li>- Her sayfa yuklemesinde guncellenir</li>
                <li>- Gece vardiyalari (16-00, 20-04) dogru hesaplanir</li>
              </ul>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-500" /> Izinli / Gorevde Degil
              </h3>
              <p className="text-xs text-gray-400 mb-3">Bugun izinli olan veya su anki saatte vardiyasi olmayan personeller.</p>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>- Gri kutucukta sadece isim gosterilir</li>
                <li>- Vardiyasi atanmamis personel gosterilmez</li>
                <li>- Izin gunu olan personel burada listelenir</li>
              </ul>
            </div>
          </div>

          <InfoBox type="info">
            <strong>Donem Onceligi:</strong> Bugunun tarihini kapsayan bir donem varsa (orn: 21-27 Nisan), o donemin vardiyalari kullanilir. Yoksa varsayilan (genel) vardiyalar kullanilir. Boylece haftalik shift degisimleri otomatik yansir.
          </InfoBox>

          <InfoBox type="warning">
            <strong>Saat Hesabi:</strong> Her zaman Istanbul saati (UTC+3) kullanilir. Tarayicinizin timezone ayarindan bagimsizdir.
          </InfoBox>
        </section>

        {/* ==================== TIPS ==================== */}
        <section id="tips" className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2 border-b border-gray-800 pb-3">
            <Settings className="w-5 h-5 text-gray-400" /> Ipuclari ve SSS
          </h2>

          <div className="space-y-3">
            {[
              { q: "En hizli shift olusturma yontemi nedir?", a: "AI ile Otomatik Olustur kullanin. Tek tikla tum hafta planlanir. Sadece rolleri dogru atadiginizdan emin olun." },
              { q: "Gecen haftanin aynisini bu haftaya kopyalayabilir miyim?", a: "Evet. Gecen haftanin donemini secin, Excel olarak indirin, sonra bu haftanin tarihiyle 'Tarihli Yukle' ile geri yukleyin." },
              { q: "Resimle yukleme neden basarisiz oldu?", a: "Resim net ve okunaklI olmali. Tablo tamamen gorunmeli. Egik veya bulanik resimler hataya neden olur. Ekran goruntusu en iyi sonucu verir." },
              { q: "Eslestirme panelinde dogru kisiyi bulamiyorum", a: "O kisi henuz gruplarda mesaj gondermemis olabilir. 'Atlayarak Yukle' secenegini kullanin, kisi yeni personel olarak eklenir." },
              { q: "AI shift'i begenmediysem ne yaparim?", a: "Onaylamadan paneli kapatin. Farkli kurallar yazarak tekrar deneyin. Veya onizlemedeki tek tek hucreleri tablo uzerinden degistirin." },
              { q: "Bir donem silersem ne olur?", a: "Donem ve altindaki tum vardiyalar kalici olarak silinir. Dikkatli olun." },
              { q: "Neden bazi personeller gorevde kartinda gorunmuyor?", a: "O gun icin vardiya atanmamissa (hucre '-' ise) personel ne gorevde ne izinli listesinde gosterilir. Vardiya atayin." },
            ].map((item) => (
              <details key={item.q} className="bg-gray-800 rounded-xl border border-gray-700 group">
                <summary className="p-4 cursor-pointer flex items-center gap-3 text-sm font-medium hover:text-blue-400 transition-colors">
                  <HelpCircle className="w-4 h-4 text-gray-500 group-open:text-blue-400" />
                  {item.q}
                </summary>
                <div className="px-4 pb-4 text-xs text-gray-400 ml-7">{item.a}</div>
              </details>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
