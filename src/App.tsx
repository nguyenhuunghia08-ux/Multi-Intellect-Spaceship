import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  GraduationCap, 
  Gamepad2, 
  FileText, 
  Rocket,
  Zap,
  Moon,
  ChevronLeft,
  Trophy,
  CheckCircle2,
  XCircle,
  Settings,
  Sparkles,
  MessageCircle,
  Lightbulb,
  Orbit,
  Star,
  User,
  LogOut,
  ShieldCheck,
  Code,
  ExternalLink,
  Activity,
  AlertTriangle,
  ClipboardList
} from 'lucide-react';
import { Grade, ModuleType, ContentModule, Question } from './types';
import { fetchContentFromSheet } from './services/dataService';
import { getSmartHint, getEncouragement } from './services/geminiService';
import { MASTER_PASSWORD, DEFAULT_GRADE_URLS } from './config';
import { db, handleFirestoreError, OperationType, auth, signInWithGoogle } from './lib/firebase';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

export default function App() {
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [selectedModule, setSelectedModule] = useState<ContentModule | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  const [gradeUrls, setGradeUrls] = useState<Record<number, string>>(() => {
    try {
      const saved = localStorage.getItem('grade_urls');
      return saved ? JSON.parse(saved) : DEFAULT_GRADE_URLS;
    } catch (e) {
      return DEFAULT_GRADE_URLS;
    }
  });

  // Student Identity
  const [studentInfo, setStudentInfo] = useState<{ name: string; className: string; isAdmin?: boolean } | null>(() => {
    try {
      const saved = localStorage.getItem('student_info');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [view, setView] = useState<'home' | 'grade' | 'quiz' | 'game' | 'settings' | 'login'>(studentInfo ? 'home' : 'login');
  const [loginInput, setLoginInput] = useState({ name: '', className: '', password: '' });
  const [diagnosticResult, setDiagnosticResult] = useState<{ grade: number, status: 'ok' | 'error', message: string, data?: any } | null>(null);
  const [isCheckingSignal, setIsCheckingSignal] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Security
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // AI states
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [resultEncouragement, setResultEncouragement] = useState<string>("");

  // Quiz state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const load = async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      else setIsSyncing(true);
      
      try {
        const content = await fetchContentFromSheet(gradeUrls);
        setData(content);
        
        // Diagnose if all are empty
        const allEmpty = Object.values(content.grades).every(g => 
          g.worksheets.length === 0 && g.unitTests.length === 0 && 
          g.mockExams.length === 0 && g.games.length === 0
        );
        
        if (allEmpty && !isSilent) {
          setDiagnosticResult({
            grade: 0,
            status: 'error',
            message: "Tín hiệu từ tất cả hành tinh đều rất yếu (Dữ liệu trống). Hãy kiểm tra lại URL hoặc đảm bảo rằng Google Sheet của bạn đã được nhập dữ liệu và Apps Script đã được triển khai chính xác!",
          });
        } else if (!allEmpty) {
          // Clear diagnostic if we have some data
          setDiagnosticResult(null);
        }
      } catch (err) {
        console.error("Critical fetch error:", err);
      } finally {
        setLoading(false);
        setIsSyncing(false);
      }
    };
    load();

    // Auto-sync every 60 seconds
    const syncInterval = setInterval(() => {
      load(true);
    }, 60000);

    return () => clearInterval(syncInterval);
  }, [gradeUrls, refreshKey]);

  useEffect(() => {
    if (!studentInfo && view !== 'login' && view !== 'settings') {
      setView('login');
    }
  }, [studentInfo, view]);

  // Anti-F12 & Protection logic
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Allow if admin, otherwise block
      if (!studentInfo?.isAdmin) {
        e.preventDefault();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (studentInfo?.isAdmin) return;

      // Block F12
      if (e.key === 'F12') {
        e.preventDefault();
      }
      // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C' || e.key === 'i' || e.key === 'j' || e.key === 'c')) {
        e.preventDefault();
      }
      // Block Ctrl+U (View Source)
      if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [studentInfo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (loginInput.name.trim() && loginInput.className.trim() && loginInput.password.trim()) {
      setIsCheckingSignal(true);
      try {
        let validPassword = MASTER_PASSWORD;
        
        try {
          const authDoc = await getDoc(doc(db, 'settings', 'auth'));
          if (authDoc.exists()) {
            validPassword = authDoc.data().password;
          }
        } catch (dbErr) {
          console.warn("Could not fetch remote password, falling back to local master password.", dbErr);
        }

        if (loginInput.password === validPassword) {
          const isMaster = loginInput.name === 'Chỉ huy Trưởng' && loginInput.className === 'Trạm chỉ huy';
          const info = { 
            name: loginInput.name.trim(), 
            className: loginInput.className.trim(),
            isAdmin: isMaster
          };

          // Record login in Firebase
          try {
            await addDoc(collection(db, 'logs'), {
              studentName: info.name,
              className: info.className,
              timestamp: serverTimestamp()
            });
          } catch (logErr) {
            console.error("Failed to log entry:", logErr);
          }

          setStudentInfo(info);
          localStorage.setItem('student_info', JSON.stringify(info));
          setView('home');
        } else {
          setLoginError('Mật mã lớp học không chính xác!');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'settings/auth');
      } finally {
        setIsCheckingSignal(false);
      }
    } else {
      setLoginError('Vui lòng khai báo đầy đủ thông tin!');
    }
  };

  const handleLogout = () => {
    setStudentInfo(null);
    localStorage.removeItem('student_info');
    setLoginInput({ name: '', className: '', password: '' });
    setSelectedGrade(null);
    setSelectedModule(null);
    setView('login');
  };

  const handleOpenSettings = () => {
    setShowPasswordModal(true);
    setPasswordInput('');
    setPasswordError(false);
  };

  const handlePasswordSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (passwordInput === MASTER_PASSWORD) {
      setShowPasswordModal(false);
      setView('settings');
    } else {
      setPasswordError(true);
    }
  };

  const handleSaveSettings = (newGradeUrls: Record<number, string>) => {
    localStorage.setItem('grade_urls', JSON.stringify(newGradeUrls));
    setGradeUrls(newGradeUrls);
    
    // Also save password to firebase if provided
    const passEl = document.getElementById('class-password-input') as HTMLInputElement;
    if (passEl && passEl.value.trim() && studentInfo?.isAdmin) {
      if (!authUser) {
        alert("⚠️ Bạn cần Đăng nhập Google (Admin) để có thể thay đổi mật mã lớp học trên hệ thống!");
        return;
      }
      setIsCheckingSignal(true);
      setDoc(doc(db, 'settings', 'auth'), {
        password: passEl.value.trim(),
        updatedAt: serverTimestamp()
      }).then(() => {
        alert("Đã cập nhật mật mã lớp học lên Trạm Vũ Trụ (Firebase)!");
      }).catch(err => {
        handleFirestoreError(err, OperationType.WRITE, 'settings/auth');
      }).finally(() => {
        setIsCheckingSignal(false);
      });
    }

    setRefreshKey(prev => prev + 1);
    setView('home');
  };

  const checkSignal = async (grade: number, url: string) => {
    if (!url || !url.startsWith('http')) {
      alert("⚠️ Tọa độ không hợp lệ. Vui lòng nhập link Apps Script!");
      return;
    }

    setIsCheckingSignal(true);
    try {
      const response = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'follow'
      });
      
      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
        setDiagnosticResult({
          grade,
          status: 'ok',
          message: "Tín hiệu ổn định! Hệ thống đã nhận diện được cấu trúc dữ liệu.",
          data: parsed
        });
      } catch (e) {
        setDiagnosticResult({
          grade,
          status: 'error',
          message: "Tín hiệu nhiễu! Apps Script không trả về dữ liệu JSON hợp lệ. Có thể bạn chưa chọn 'Bất kỳ ai (Anyone)' khi triển khai.",
          data: text.substring(0, 500)
        });
      }
    } catch (error) {
      setDiagnosticResult({
        grade,
        status: 'error',
        message: "Mất kết nối hoàn toàn! Không thể liên lạc được với trạm dữ liệu qua URL này. Hãy kiểm tra lại URL.",
        data: String(error)
      });
    } finally {
      setIsCheckingSignal(false);
    }
  };

  const [pendingGrade, setPendingGrade] = useState<Grade | null>(null);

  const handleGradeSelect = (grade: Grade) => {
    setSelectedGrade(grade);
    
    // For admins, we just enter the grade view directly to see the content
    if (studentInfo?.isAdmin) {
      setView('grade');
      return;
    }
    
    // Check if data is already available
    const gradeData = data?.grades?.[grade];
    const isEmpty = !gradeData || (
      (!gradeData.worksheets || gradeData.worksheets.length === 0) && 
      (!gradeData.unitTests || gradeData.unitTests.length === 0) && 
      (!gradeData.mockExams || gradeData.mockExams.length === 0) && 
      (!gradeData.games || gradeData.games.length === 0)
    );

    if (isEmpty) {
      setPendingGrade(grade);
      setRefreshKey(prev => prev + 1);
      // We will handle the navigation in a useEffect after data updates
      return;
    }
    
    setView('grade');
  };

  // Handle navigation after data refresh from handleGradeSelect
  useEffect(() => {
    if (pendingGrade && !loading) {
      const gradeData = data?.grades?.[pendingGrade];
      const stillEmpty = !gradeData || (
        (!gradeData.worksheets || gradeData.worksheets.length === 0) && 
        (!gradeData.unitTests || gradeData.unitTests.length === 0) && 
        (!gradeData.mockExams || gradeData.mockExams.length === 0) && 
        (!gradeData.games || gradeData.games.length === 0)
      );

      if (!stillEmpty) {
        setView('grade');
        setPendingGrade(null);
      } else {
        // If it's still empty, inform the user and reset pending state
        alert("Tín hiệu từ hành tinh này quá yếu hoặc chưa có dữ liệu. Vui lòng kiểm tra lại URL trong Cài đặt!");
        setPendingGrade(null);
      }
    }
  }, [data, loading, pendingGrade]);

  const handleModuleSelect = (module: ContentModule) => {
    setSelectedModule(module);
    if (module.type === 'game') {
      setView('game');
    } else {
      setView('quiz');
      setCurrentQuestionIndex(0);
      setScore(0);
      setShowResult(false);
      setSelectedOption(null);
      setIsLocked(false);
      setAiMessage(null);
    }
  };

  const handleAiHint = async () => {
    if (!selectedModule || isAiLoading) return;
    setIsAiLoading(true);
    const question = selectedModule.questions?.[currentQuestionIndex];
    if (question) {
      const hint = await getSmartHint(question.question, question.options, selectedGrade || 1);
      setAiMessage(hint);
    }
    setIsAiLoading(false);
  };

  useEffect(() => {
    if (showResult) {
      getEncouragement().then(setResultEncouragement);
    }
  }, [showResult]);

  const handleAnswer = (optionIndex: number) => {
    if (isLocked) return;
    setSelectedOption(optionIndex);
    setIsLocked(true);
    setAiMessage(null);

    if (optionIndex === selectedModule?.questions?.[currentQuestionIndex].correctAnswer) {
      setScore(score + 1);
    }

    setTimeout(() => {
      if (currentQuestionIndex + 1 < (selectedModule?.questions?.length || 0)) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setSelectedOption(null);
        setIsLocked(false);
      } else {
        setShowResult(true);
      }
    }, 1500);
  };

  // Fallback for empty data or severe errors
  useEffect(() => {
    if (!view) setView('login');
    if (view === 'grade' && !selectedGrade) setView('home');
    if ((view === 'quiz' || view === 'game') && !selectedModule) setView('home');
  }, [view, selectedGrade, selectedModule]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center overflow-hidden">
        <div className="relative">
          <motion.div
             animate={{ 
               y: [0, -20, 0],
               rotate: [0, 5, -5, 0]
             }}
             transition={{ repeat: Infinity, duration: 2 }}
             className="mb-8"
          >
            <Rocket size={80} className="text-sky-400" />
          </motion.div>
          
          {/* Pulsing rings */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-sky-500/20 rounded-full animate-ping" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-sky-500/10 rounded-full animate-ping [animation-delay:0.5s]" />
        </div>
        
        <div className="text-sky-400 font-black tracking-widest animate-pulse text-lg mb-2">INITIALIZING SPACESHIP...</div>
        <div className="text-slate-500 text-xs font-bold uppercase tracking-[0.5em]">Establishing Signal to Mission Control</div>
        
        <motion.div 
          animate={{ width: ["0%", "100%", "0%"] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          className="w-48 h-1 bg-sky-500 rounded-full mt-8 shadow-[0_0_10px_#0ea5e9]"
        />
        
        <div className="mt-12 flex flex-col items-center gap-4">
          <div className="text-slate-700 text-[10px] font-mono uppercase tracking-widest">
            SYSTEM_STATUS: {data ? 'DATA_SYNC_WAIT' : 'CONNECTING_TO_STATIONS'}
          </div>
          
          <button 
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="mt-4 px-4 py-2 border border-white/5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest transition-all"
          >
            Thiết lập lại tàu vũ trụ (Reset App)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 font-sans text-slate-100 pb-12 relative overflow-hidden">
      {/* Background Stars & Flying Objects Effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden h-full">
        <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-white rounded-full animate-pulse opacity-40" />
        <div className="absolute top-1/2 left-3/4 w-1 h-1 bg-white rounded-full animate-pulse delay-75 opacity-30" />
        <div className="absolute top-3/4 left-1/2 w-1 h-1 bg-white rounded-full animate-pulse delay-150 opacity-40" />
        <div className="absolute top-1/3 left-2/3 w-1.5 h-1.5 bg-yellow-400 rounded-full animate-ping delay-500 opacity-20" />
        
        {/* Flying Rockets across the screen */}
        <motion.div
          initial={{ x: "-100%", y: "20%", rotate: 45 }}
          animate={{ x: "120%", y: "40%" }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute opacity-10"
        >
          <Rocket size={40} className="text-sky-400" />
        </motion.div>

        <motion.div
          initial={{ x: "120%", y: "70%", rotate: -135 }}
          animate={{ x: "-20%", y: "50%" }}
          transition={{ duration: 35, repeat: Infinity, ease: "linear", delay: 5 }}
          className="absolute opacity-5"
        >
          <Rocket size={30} className="text-violet-400" />
        </motion.div>

        <motion.div
           animate={{ 
             scale: [1, 1.1, 1],
             x: [0, 20, 0],
             y: [0, -20, 0]
           }}
           transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
           className="absolute top-20 right-40 opacity-10"
        >
          <Orbit size={100} className="text-sky-500" />
        </motion.div>

        {/* Rainbow Stars */}
        {[...Array(36)].map((_, i) => (
          <motion.div
            key={`star-${i}`}
            className="absolute z-0 pointer-events-none"
            initial={{ 
              top: `${Math.random() * 100}%`, 
              left: `${Math.random() * 100}%`,
              scale: Math.random() * 0.5 + 0.5,
              opacity: 0.1
            }}
            animate={{ 
              color: ["#ff0000", "#ff7f00", "#ffff00", "#00ff00", "#0000ff", "#4b0082", "#8b00ff"],
              opacity: [0.1, 0.4, 0.1],
              scale: [1, 1.2, 1],
              rotate: [0, 180, 360]
            }}
            transition={{ 
              color: { duration: 5, repeat: Infinity, ease: "linear" },
              opacity: { duration: Math.random() * 3 + 2, repeat: Infinity },
              scale: { duration: Math.random() * 3 + 2, repeat: Infinity },
              rotate: { duration: Math.random() * 10 + 10, repeat: Infinity, ease: "linear" },
              delay: Math.random() * 5
            }}
          >
            <Star size={Math.random() * 20 + 10} fill="currentColor" />
          </motion.div>
        ))}
        
        {/* Animated Planets/Orbs */}
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ repeat: Infinity, duration: 8 }}
          className="absolute -top-20 -right-20 w-64 h-64 bg-sky-500/20 rounded-full blur-3xl"
        />
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.05, 0.1, 0.05] }}
          transition={{ repeat: Infinity, duration: 12, delay: 2 }}
          className="absolute top-1/2 -left-32 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl"
        />
      </div>

      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between shadow-lg sticky top-0 z-50 border-b border-slate-800">
        <div 
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => setView('home')}
        >
          <motion.div
            animate={{ 
              y: [0, -4, 0],
              rotate: [3, 0, 3]
            }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="bg-sky-500 p-2 rounded-xl shadow-lg shadow-sky-500/20"
          >
            <Rocket className="text-white" size={24} />
          </motion.div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-sky-400 leading-none">Multi-Intellect Spaceship</h1>
            <div className="text-[10px] font-black mt-1 uppercase tracking-widest flex overflow-hidden">
               {"Co-piloted by Mr Nghia".split("").map((char, index) => (
                 <motion.span
                   key={index}
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ 
                     opacity: [0, 1, 1, 0],
                     y: [5, 0, 0, -5],
                     color: ["#94a3b8", "#38bdf8", "#818cf8", "#38bdf8", "#94a3b8"],
                     textShadow: [
                       "0 0 0px rgba(56,189,248,0)",
                       "0 0 10px rgba(56,189,248,0.8)",
                       "0 0 15px rgba(129,140,248,0.8)",
                       "0 0 10px rgba(56,189,248,0.8)",
                       "0 0 0px rgba(56,189,248,0)"
                     ]
                   }}
                   transition={{
                     duration: 5,
                     repeat: Infinity,
                     delay: index * 0.1,
                     ease: "easeInOut"
                   }}
                   style={{ display: char === " " ? "inline-block" : "inline", minWidth: char === " " ? "4px" : "auto" }}
                 >
                   {char}
                 </motion.span>
               ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {studentInfo && (
            <>
              {/* Desktop Student Info */}
              <div className="hidden md:flex items-center gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/5">
                <div className="bg-sky-500/20 p-2 rounded-lg">
                  <User size={16} className="text-sky-400" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-sky-400/60 leading-none mb-1">Cơ trưởng</p>
                  <p className="text-xs font-bold text-white leading-none">{studentInfo.name} - {studentInfo.className}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="ml-2 p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-all"
                  title="Đổi phi hành gia"
                >
                  <LogOut size={14} />
                </button>
              </div>
              {/* Mobile Student Info Icon */}
              <button 
                onClick={handleLogout}
                className="md:hidden flex flex-col items-center justify-center p-2 bg-white/5 rounded-xl border border-white/5"
              >
                <User size={16} className="text-sky-400" />
                <span className="text-[8px] font-black text-white uppercase mt-1 truncate max-w-[50px]">{studentInfo.name.split(' ')[0]}</span>
              </button>
            </>
          )}
          {studentInfo?.isAdmin && (
            <div className="flex items-center gap-2">
              <AnimatePresence>
                {isSyncing && (
                  <motion.div 
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-1.5 px-2 py-1 bg-sky-500/10 rounded-full border border-sky-500/20"
                  >
                    <div className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />
                    <span className="text-[8px] font-black text-sky-400 uppercase tracking-tighter">Syncing...</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <button 
                onClick={() => {
                  setRefreshKey(prev => prev + 1);
                }}
                disabled={loading}
                className={`p-2 md:p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 shadow-lg ${loading ? 'animate-spin' : ''}`}
                title="Làm mới dữ liệu từ Google Sheet"
              >
                <Zap size={20} className="text-yellow-400" />
              </button>
            </div>
          )}
          <button 
            onClick={handleOpenSettings}
            className="p-2 md:p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-white/5 shadow-lg"
          >
            <Settings size={20} className="text-slate-400" />
          </button>
        </div>
      </header>

      <main className={`${(view === 'quiz' || view === 'game') ? 'max-w-7xl' : 'max-w-4xl'} mx-auto px-4 mt-8 transition-all duration-500`}>
        <AnimatePresence mode="wait">
          {view === 'login' && (
            <motion.div
              key="view-login"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex items-center justify-center min-h-[60vh]"
            >
              <div className="bg-slate-800 border-2 border-sky-500/30 rounded-[40px] p-8 md:p-12 max-w-md w-full shadow-2xl relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-sky-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-violet-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
                
                <div className="relative z-10 text-center mb-8">
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                    className="inline-block bg-sky-500 p-4 rounded-3xl shadow-xl shadow-sky-500/40 mb-4"
                  >
                    <Rocket className="text-white" size={48} />
                  </motion.div>
                  <h2 className="text-xl font-black text-white tracking-tighter uppercase">
                    Thông Tin Hành Trình
                  </h2>
                  <p className="text-slate-400 mt-2 text-xs font-medium italic">Vui lòng khai báo danh tánh và mật mã để lên tàu!</p>
                </div>

                <form onSubmit={handleLogin} className="relative z-10 space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-sky-400 uppercase tracking-widest ml-1">Tên Cơ Trưởng</label>
                    <input 
                      type="text" 
                      required
                      value={loginInput.name}
                      onChange={(e) => setLoginInput({...loginInput, name: e.target.value})}
                      placeholder="VD: Nguyễn Văn A..."
                      className="w-full p-5 bg-slate-900 border-2 border-white/5 rounded-2xl text-white focus:border-sky-500 focus:outline-none transition-all font-bold placeholder:text-slate-700"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-black text-violet-400 uppercase tracking-widest ml-1">Lớp / Phi Đội</label>
                    <input 
                      type="text" 
                      required
                      value={loginInput.className}
                      onChange={(e) => setLoginInput({...loginInput, className: e.target.value})}
                      placeholder="VD: 3/4, 5A1..."
                      className="w-full p-5 bg-slate-900 border-2 border-white/5 rounded-2xl text-white focus:border-violet-500 focus:outline-none transition-all font-bold placeholder:text-slate-700"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-amber-400 uppercase tracking-widest ml-1">Mật mã vào lớp học</label>
                    <input 
                      type="password" 
                      required
                      value={loginInput.password}
                      onChange={(e) => setLoginInput({...loginInput, password: e.target.value})}
                      placeholder="••••••••"
                      className="w-full p-5 bg-slate-900 border-2 border-white/5 rounded-2xl text-white focus:border-amber-500 focus:outline-none transition-all font-bold placeholder:text-slate-700 font-mono tracking-widest"
                    />
                  </div>

                  {loginError && (
                    <motion.p 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-xs font-bold text-center bg-red-400/10 p-3 rounded-xl border border-red-400/20"
                    >
                      {loginError}
                    </motion.p>
                  )}

                  <button 
                    type="submit"
                    className="w-full text-white py-5 rounded-2xl font-black text-xl shadow-xl transition-all active:scale-95 uppercase tracking-widest flex items-center justify-center gap-3 mt-4 bg-sky-500 hover:bg-sky-600 shadow-sky-500/30"
                  >
                    NHẬN THẺ & LÊN TÀU
                    <Zap size={24} />
                  </button>
                </form>

                <p className="mt-8 text-[10px] text-slate-500 text-center font-bold uppercase tracking-tighter opacity-50 relative z-10">
                  Hệ thống kiểm soát không gian Multi-Intellect
                </p>
              </div>
            </motion.div>
          )}

          {view === 'home' && (
            <motion.div 
              key="view-home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="text-center mb-12 relative">
                <motion.div
                  className="mb-4"
                  animate={{ 
                    y: [0, -5, 0],
                  }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                >
                  <h2 className="text-4xl md:text-5xl font-black text-white flex flex-wrap justify-center items-center gap-x-3">
                    {"Sẵn sàng cất cánh nào!".split(" ").map((word, wIdx) => (
                      <span key={wIdx} className="inline-flex">
                        {word.split("").map((char, cIdx) => (
                          <motion.span
                            key={cIdx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ 
                              opacity: [0, 1, 1, 0.8],
                              y: [5, 0, 0, 0],
                              color: ["#ffffff", "#38bdf8", "#818cf8", "#38bdf8", "#ffffff"],
                              textShadow: [
                                "0 0 0px rgba(56,189,248,0)",
                                "0 0 20px rgba(56,189,248,0.8)",
                                "0 0 30px rgba(129,140,248,0.8)",
                                "0 0 10px rgba(56,189,248,0.4)",
                                "0 0 0px rgba(56,189,248,0)"
                              ]
                            }}
                            transition={{
                              duration: 5,
                              repeat: Infinity,
                              delay: (wIdx * 3 + cIdx) * 0.1,
                              ease: "easeInOut"
                            }}
                          >
                            {char}
                          </motion.span>
                        ))}
                      </span>
                    ))}
                    <motion.span
                      animate={{ 
                        rotate: [0, 20, 0],
                        scale: [1, 1.3, 1],
                        filter: ["drop-shadow(0 0 0px #38bdf8)", "drop-shadow(0 0 15px #38bdf8)", "drop-shadow(0 0 0px #38bdf8)"]
                      }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      🚀
                    </motion.span>
                  </h2>
                </motion.div>
                <p className="text-slate-400 text-lg font-medium">Chọn phi đội tàu vũ trụ của bé để bắt đầu hành trình nhé</p>
                
                {diagnosticResult && diagnosticResult.status === 'error' && (
                  <motion.div 
                    initial={{ opacity: 0, h: 0 }}
                    animate={{ opacity: 1, h: 'auto' }}
                    className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-left max-w-2xl mx-auto"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="text-red-400 shrink-0" size={20} />
                      <div>
                        <p className="text-red-400 font-black uppercase text-[10px] tracking-widest mb-1">Cảnh báo hệ thống (Grade {diagnosticResult.grade})</p>
                        <p className="text-white text-xs font-bold leading-relaxed">{diagnosticResult.message}</p>
                        <button 
                          onClick={() => setView('settings')}
                          className="mt-3 text-[10px] font-black underline uppercase text-sky-400 hover:text-sky-300 transition-colors"
                        >
                          Đi đến trung tâm điều khiển để sửa lỗi
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
                
                {/* Floating Decorative Rockets */}
                <motion.div 
                  className="absolute -top-10 -left-10 opacity-20 hidden md:block"
                  animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }}
                  transition={{ repeat: Infinity, duration: 5 }}
                >
                  <Rocket size={60} className="text-sky-400" />
                </motion.div>
                <motion.div 
                  className="absolute top-20 -right-10 opacity-10 hidden md:block"
                  animate={{ y: [0, 15, 0], rotate: [45, 55, 45] }}
                  transition={{ repeat: Infinity, duration: 4, delay: 1 }}
                >
                  <Rocket size={40} className="text-violet-400" />
                </motion.div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {([1, 2, 3, 4, 5] as Grade[]).map((grade) => (
                  <GradeCard 
                    key={grade} 
                    grade={grade} 
                    onClick={() => handleGradeSelect(grade)}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {view === 'grade' && selectedGrade && (
            <motion.div 
              key="view-grade"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <button 
                onClick={() => setView('home')}
                className="flex items-center gap-2 text-sky-400 font-bold mb-8 hover:bg-sky-400/10 px-4 py-2 rounded-xl transition-all"
              >
                <ChevronLeft size={20} />
                Quay lại trạm chỉ huy
              </button>

              <div className="mb-12 flex items-center gap-6">
                 <div className={`w-24 h-24 rounded-3xl flex items-center justify-center text-4xl font-black text-white shadow-2xl rotate-3 shadow-sky-500/20 border-2 border-white/10 ${getGradeColor(selectedGrade)}`}>
                    {selectedGrade}
                 </div>
                 <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tight">Mission: Grade {selectedGrade}</h2>
                    <p className="text-slate-400 font-medium italic">Chọn một khoang tàu để thực hiện nhiệm vụ!</p>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ModuleSection 
                  title="Khoang: Phiếu bài tập" 
                  icon={<FileText size={24} />} 
                  modules={data.grades[selectedGrade].worksheets}
                  onSelect={handleModuleSelect}
                  color="bg-sky-500/10 text-sky-400"
                />
                <ModuleSection 
                  title="Khoang: Unit Test" 
                  icon={<BookOpen size={24} />} 
                  modules={data.grades[selectedGrade].unitTests}
                  onSelect={handleModuleSelect}
                  color="bg-violet-500/10 text-violet-400"
                />
                <ModuleSection 
                  title="Khoang: Kiểm tra định kì (Thử)" 
                  icon={<Rocket size={24} />} 
                  modules={data.grades[selectedGrade].mockExams}
                  onSelect={handleModuleSelect}
                  color="bg-yellow-500/10 text-yellow-400"
                />
                <ModuleSection 
                  title="Khoang: Game Vũ Trụ" 
                  icon={<Gamepad2 size={24} />} 
                  modules={data.grades[selectedGrade].games}
                  onSelect={handleModuleSelect}
                  color="bg-orange-500/10 text-orange-400"
                />
              </div>
            </motion.div>
          )}

          {view === 'quiz' && selectedModule && (
            <motion.div 
              key="view-quiz"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-slate-800/80 backdrop-blur-xl rounded-[40px] p-6 md:p-12 shadow-2xl relative overflow-hidden h-full flex flex-col border border-white/10"
            >
              {/* Decorative scanline effect */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] z-0 bg-[length:100%_2px,3px_100%]" />

              {selectedModule.link || selectedModule.htmlContent ? (
                <div className="flex-1 flex flex-col relative z-10 items-center justify-center">
                  <div className="absolute top-0 left-0 w-full flex justify-between items-center p-6 md:p-8">
                    <button onClick={() => setView('grade')} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-3 rounded-full"><ChevronLeft size={24} /></button>
                    <div className="w-10" />
                  </div>

                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="max-w-2xl w-full text-center space-y-8"
                  >
                    <div className="relative inline-block mb-4">
                      <motion.div
                        animate={{ 
                          translateY: [0, -10, 0],
                          rotate: [0, 5, -5, 0]
                        }}
                        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                        className="bg-sky-500 p-6 rounded-[32px] shadow-2xl shadow-sky-500/20"
                      >
                        <Rocket className="text-white w-16 h-16 md:w-20 md:h-20" />
                      </motion.div>
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute -bottom-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full blur-xl"
                      />
                    </div>

                    <div>
                      <h2 className="text-2xl md:text-4xl font-black text-white mb-3 tracking-tighter uppercase leading-tight">
                        {selectedModule.title}
                      </h2>
                      <p className="text-slate-400 text-sm md:text-base font-medium max-w-md mx-auto">
                        Trạm dữ liệu đã sẵn sàng. Hãy cất cánh để khám phá kho kiến thức từ Multi-Intellect!
                      </p>
                    </div>

                    <div className="pt-6">
                      <button 
                        onClick={() => window.open(selectedModule.link, '_blank')}
                        className="group relative inline-flex items-center justify-center px-10 py-4 font-black text-lg text-white transition-all duration-300 bg-sky-500 rounded-[24px] hover:bg-sky-600 shadow-[0_15px_30px_rgba(14,165,233,0.3)] hover:shadow-sky-500/50 active:scale-95 uppercase tracking-widest gap-3 overflow-hidden"
                      >
                        <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        BẮT ĐẦU KHÁM PHÁ
                        <ExternalLink size={20} className="group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 italic mt-8">
                      Lưu ý: Nội dung sẽ được mở trong một tab (cửa sổ) mới để đảm bảo trải nghiệm tốt nhất cho phi hành gia.
                    </p>
                  </motion.div>
                </div>
              ) : !showResult ? (
                <div className="relative z-10">
                  <div className="flex justify-between items-center mb-8">
                    <span className="text-sky-400/60 font-black tracking-widest uppercase text-xs">Phân khu: {currentQuestionIndex + 1}/{selectedModule.questions?.length}</span>
                    <div className="h-2 w-32 md:w-48 bg-slate-700/50 rounded-full overflow-hidden border border-white/5">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${((currentQuestionIndex) / (selectedModule.questions?.length || 1)) * 100}%` }}
                        className="h-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                      />
                    </div>
                  </div>

                  <div className="relative mb-12">
                     <h3 className="text-2xl md:text-4xl font-black text-white text-center leading-tight tracking-tight">
                        {selectedModule.questions?.[currentQuestionIndex].question}
                     </h3>
                  </div>

                  {/* AI Bubble */}
                  <AnimatePresence>
                     {aiMessage && (
                       <motion.div 
                         initial={{ opacity: 0, scale: 0.8, y: 10 }}
                         animate={{ opacity: 1, scale: 1, y: 0 }}
                         exit={{ opacity: 0, scale: 0.8 }}
                         className="mb-8 bg-sky-400/10 p-6 rounded-[32px] relative border border-sky-400/30 backdrop-blur-md"
                       >
                          <div className="flex gap-4">
                             <div className="bg-sky-500 p-2 rounded-xl h-fit mt-1 shadow-lg shadow-sky-500/20">
                                <MessageCircle size={16} className="text-white" />
                             </div>
                             <p className="text-sky-100 font-medium leading-relaxed italic">"Phi hành gia này, tôi có gợi ý: {aiMessage}"</p>
                          </div>
                       </motion.div>
                     )}
                  </AnimatePresence>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedModule.questions?.[currentQuestionIndex].options.map((option, idx) => (
                      <button
                        key={idx}
                        disabled={isLocked}
                        onClick={() => handleAnswer(idx)}
                        className={`
                          p-6 rounded-[32px] text-left text-lg font-bold transition-all border-2
                          ${selectedOption === null ? 'border-white/5 bg-white/5 hover:border-sky-400/50 hover:bg-white/10 active:scale-95 text-slate-300' : ''}
                          ${selectedOption === idx ? (idx === selectedModule.questions?.[currentQuestionIndex].correctAnswer ? 'bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)]') : ''}
                          ${isLocked && idx === selectedModule.questions?.[currentQuestionIndex].correctAnswer ? 'bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : ''}
                        `}
                      >
                        <div className="flex items-center justify-between">
                          <span>{option}</span>
                          {isLocked && idx === selectedModule.questions?.[currentQuestionIndex].correctAnswer && <CheckCircle2 className="text-green-400" />}
                          {selectedOption === idx && idx !== selectedModule.questions?.[currentQuestionIndex].correctAnswer && <XCircle className="text-red-400" />}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-12 pt-8 border-t border-white/5 flex justify-center">
                    <button 
                      onClick={handleAiHint}
                      disabled={isAiLoading || isLocked}
                      className={`
                        flex items-center gap-2 px-8 py-3 rounded-2xl font-black transition-all uppercase tracking-widest text-sm
                        ${isAiLoading ? 'bg-slate-700 text-slate-500' : 'bg-sky-500 text-white hover:bg-sky-600 shadow-xl shadow-sky-500/20 active:scale-95'}
                      `}
                    >
                      {isAiLoading ? (
                        <div className="w-5 h-5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Sparkles size={20} />
                      )}
                      Trợ lý chuyến bay
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 relative z-10">
                   <div className="mb-8 inline-block relative">
                      <motion.div
                        animate={{ 
                          scale: [1, 1.1, 1],
                          rotate: [0, 5, -5, 0]
                        }}
                        transition={{ repeat: Infinity, duration: 4 }}
                      >
                        <Rocket className="text-yellow-400 w-32 h-32 drop-shadow-[0_0_30px_rgba(250,204,21,0.4)]" />
                      </motion.div>
                      <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute -top-2 -right-2 bg-sky-500 text-white w-12 h-12 rounded-full flex items-center justify-center font-black text-xl shadow-xl shadow-sky-500/40"
                      >
                        {score}
                      </motion.div>
                   </div>
                   <h3 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter uppercase">Nhiệm vụ hoàn tất!</h3>
                   
                   {resultEncouragement && (
                     <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/5 backdrop-blur-md p-6 rounded-[32px] mb-12 max-w-md mx-auto border border-white/10 text-sky-200 font-bold italic"
                     >
                        "{resultEncouragement}"
                     </motion.div>
                   )}

                   <p className="text-xl text-slate-400 mb-12 font-medium tracking-wide">Bạn đã thu thập được <span className="text-sky-400 font-black">{score}/{selectedModule.questions?.length}</span> dữ liệu không gian!</p>
                   
                   <div className="flex flex-col md:flex-row gap-4 justify-center">
                     <button 
                        onClick={() => setView('grade')}
                        className="bg-sky-500 text-white px-10 py-5 rounded-3xl font-black text-xl shadow-[0_15px_30px_rgba(14,165,233,0.3)] hover:bg-sky-600 transition-all active:scale-95 uppercase tracking-widest"
                     >
                       Chọn đích đến tiếp theo
                     </button>
                     <button 
                        onClick={() => handleModuleSelect(selectedModule)}
                        className="bg-transparent border-2 border-white/20 text-white px-10 py-5 rounded-3xl font-black text-xl hover:bg-white/5 transition-all active:scale-95 uppercase tracking-widest"
                     >
                       Bay lại vòng nữa
                     </button>
                   </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'game' && selectedModule && (
            <motion.div 
              key="view-game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white p-8 rounded-[40px] shadow-xl flex flex-col h-full"
            >
               <div className="flex justify-between items-center mb-8">
                  <button onClick={() => setView('grade')} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={24} /></button>
                  <h3 className="text-2xl font-bold">{selectedModule.title}</h3>
                  <button 
                    onClick={() => window.open(selectedModule.link, '_blank')}
                    className="p-2 bg-orange-500/10 text-orange-600 rounded-xl hover:bg-orange-500/20 transition-all flex items-center gap-2 text-xs font-bold uppercase"
                    title="Mở trong cửa sổ mới"
                  >
                    <ExternalLink size={18} />
                    <span className="hidden md:inline">Mở ở cửa sổ mới</span>
                  </button>
               </div>
               
                {selectedModule.link || selectedModule.htmlContent ? (
                  <div className="flex-1 flex flex-col relative z-10 items-center justify-center p-8">
                    <div className="absolute top-0 left-0 w-full flex justify-between items-center p-6">
                      <button onClick={() => setView('grade')} className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 p-3 rounded-full"><ChevronLeft size={24} /></button>
                      <div className="w-10" />
                    </div>

                    <motion.div 
                      initial={{ y: 30, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="max-w-2xl w-full text-center space-y-6"
                    >
                      <div className="relative inline-block mb-4">
                        <motion.div
                          animate={{ 
                            scale: [1, 1.05, 1],
                            rotate: [0, 3, -3, 0]
                          }}
                          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                          className="bg-orange-500 p-8 rounded-[40px] shadow-2xl shadow-orange-500/30"
                        >
                          <Gamepad2 className="text-white w-20 h-20 md:w-28 md:h-28" />
                        </motion.div>
                        <motion.div 
                          animate={{ y: [0, -10, 0], opacity: [0.4, 0.1, 0.4] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-16 h-3 bg-black/10 rounded-full blur-md"
                        />
                      </div>

                      <div>
                        <h2 className="text-3xl md:text-5xl font-black text-slate-900 mb-3 tracking-tighter uppercase">
                          {selectedModule.title}
                        </h2>
                        <p className="text-slate-500 text-sm md:text-lg font-medium max-w-md mx-auto leading-relaxed">
                          Bạn đã sẵn sàng để chiến thắng trò chơi này chưa? 
                          Nhiệm vụ đang chờ bạn ở phía trước!
                        </p>
                      </div>

                      <div className="pt-6">
                        <button 
                          onClick={() => window.open(selectedModule.link, '_blank')}
                          className="group relative inline-flex items-center justify-center px-12 py-5 font-black text-xl text-white transition-all duration-300 bg-orange-500 rounded-[30px] hover:bg-orange-600 shadow-[0_20px_40px_rgba(249,115,22,0.3)] hover:shadow-orange-500/50 active:scale-95 uppercase tracking-[0.1em] gap-3"
                        >
                          <Zap size={24} className="text-yellow-300 animate-pulse" />
                          CHƠI NGAY THÔI
                          <ExternalLink size={24} />
                        </button>
                      </div>

                      <div className="pt-12 flex items-center justify-center gap-6">
                        <div className="flex -space-x-3">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="w-10 h-10 rounded-full border-4 border-white bg-slate-200"></div>
                          ))}
                        </div>
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">+150 Phi hành gia đang chơi</span>
                      </div>
                    </motion.div>
                  </div>
               ) : (
                 <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <Gamepad2 size={80} className="text-sky-400 mb-6" />
                    <p className="text-xl text-slate-600 mb-8 max-w-md text-center">
                      Module trò chơi "{selectedModule.title}" đang được tích hợp thêm nhiều thử thách hóc búa từ Multi-Intellect Spaceship!
                    </p>
                    <button 
                      onClick={() => setView('grade')}
                      className="bg-orange-500 text-white px-8 py-4 rounded-2xl font-bold text-xl shadow-lg hover:bg-orange-600 transition-all"
                    >
                      Quay lại học nhé!
                    </button>
                 </div>
               )}
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div 
               key="view-settings"
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 20 }}
               className="bg-slate-800/80 backdrop-blur-xl p-8 rounded-[40px] shadow-2xl border border-white/10"
            >
                <div className="flex justify-between items-center mb-8">
                   <button onClick={() => setView('home')} className="text-slate-400 hover:text-white transition-colors"><ChevronLeft size={24} /></button>
                   <h3 className="text-2xl font-black text-white uppercase tracking-widest">Trung tâm điều khiển</h3>
                   <div className="w-10" />
                </div>
               
               <div className="space-y-6">
                  <p className="text-sm text-sky-200/60 mb-4 bg-sky-500/5 p-6 rounded-[32px] border border-sky-500/20 leading-relaxed font-medium">
                    Phi hành gia trưởng có thể cấu hình mỗi hành tinh (Grade) là một trạm dữ liệu riêng biệt. Dán mã định danh từ Apps Script vào các ô bên dưới.
                  </p>

                  {([1, 2, 3, 4, 5] as const).map((g) => {
                    const gradeData = data?.grades?.[g];
                    const count = gradeData ? (gradeData.worksheets?.length || 0) + (gradeData.unitTests?.length || 0) + (gradeData.mockExams?.length || 0) + (gradeData.games?.length || 0) : 0;
                    return (
                      <div key={g} className="flex flex-col gap-4">
                        <label className="block text-sm font-black text-slate-300 flex items-center justify-between uppercase tracking-wider">
                          <span>Hành tinh Grade {g}</span>
                          <div className="flex gap-2">
                            <span className={`text-[10px] px-3 py-1 rounded-full font-bold ${count > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                              {count > 0 ? `${count} dữ liệu` : 'Trống'}
                            </span>
                            <span className="text-[10px] text-sky-400 px-3 py-1 bg-sky-400/10 rounded-full font-bold">online</span>
                          </div>
                        </label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            defaultValue={gradeUrls[g]}
                            id={`grade-url-${g}`}
                            placeholder="Dán link Apps Script..."
                            className="flex-1 p-4 bg-slate-900/50 rounded-2xl border-2 border-white/5 text-white focus:border-sky-500 focus:outline-none transition-all placeholder:text-slate-700 font-mono text-sm"
                          />
                          {gradeUrls[g] && (
                            <button 
                              onClick={() => checkSignal(g, gradeUrls[g])}
                              className="px-4 bg-slate-800 hover:bg-slate-700 rounded-2xl border border-white/5 text-sky-400 group transition-all disabled:opacity-50"
                              title="Kiểm tra tín hiệu JSON"
                              disabled={isCheckingSignal}
                            >
                              <Activity size={18} className={isCheckingSignal ? 'animate-pulse' : 'group-hover:scale-110'} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  <div className="flex flex-col md:flex-row gap-4 mb-12">
                     <button 
                       onClick={() => {
                         const newUrls = { ...gradeUrls };
                         [1, 2, 3, 4, 5].forEach(g => {
                           const el = document.getElementById(`grade-url-${g}`) as HTMLInputElement;
                           if (el) newUrls[g as keyof typeof newUrls] = el.value;
                         });
                         handleSaveSettings(newUrls);
                       }}
                       className="flex-1 bg-sky-500 text-white py-5 rounded-[24px] font-black text-lg hover:bg-sky-600 shadow-[0_10px_20px_rgba(14,165,233,0.3)] transition-all active:scale-95 uppercase tracking-[0.2em]"
                     >
                       Lưu Tọa Độ & Kích Hoạt
                     </button>
                     <button 
                       onClick={() => {
                         if (confirm("Chỉ huy có chắc muốn đặt lại tọa độ gốc cho tất cả hành tinh không?")) {
                           localStorage.removeItem('grade_urls');
                           window.location.reload();
                         }
                       }}
                       className="md:w-1/3 bg-slate-700 text-slate-300 py-5 rounded-[24px] font-black text-sm hover:bg-red-500 hover:text-white transition-all active:scale-95 uppercase"
                     >
                       Đặt lại mặc định
                     </button>
                  </div>

                   {studentInfo?.isAdmin && (
                    <div className="pt-8 border-t border-white/10 mt-8">
                       <h4 className="font-black text-amber-400 mb-6 flex items-center gap-2 uppercase tracking-widest text-sm">
                          <ShieldCheck size={18} className="text-amber-400" />
                          Trung tâm Bảo mật (Admin Only)
                       </h4>
                       
                       {!authUser ? (
                         <div className="bg-slate-900 border-2 border-dashed border-amber-500/20 p-8 rounded-[32px] text-center mb-6">
                            <p className="text-amber-200/60 text-xs font-bold uppercase tracking-widest mb-4">Xác thực quyền Chỉ huy Trưởng</p>
                            <button 
                              onClick={() => signInWithGoogle()}
                              className="bg-white text-slate-900 px-6 py-3 rounded-xl font-black text-xs flex items-center gap-2 mx-auto hover:bg-amber-50 shadow-lg active:scale-95 transition-all"
                            >
                              <img src="https://www.gstatic.com/firebase/anonymous-scan.png" className="w-4 h-4 hidden" />
                              <ShieldCheck size={16} />
                              ĐĂNG NHẬP GOOGLE ADMIN
                            </button>
                            <p className="mt-4 text-[10px] text-slate-500 italic">Cần đăng nhập email nguyenhuunghia.08@gmail.com để ghi dữ liệu.</p>
                         </div>
                       ) : (
                         <div className="bg-green-500/5 border border-green-500/20 p-4 rounded-2xl mb-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-black text-[10px]">OK</div>
                               <div>
                                  <p className="text-[10px] font-black text-green-400 uppercase leading-none">Admin Authenticated</p>
                                  <p className="text-xs text-white font-bold">{authUser.email}</p>
                               </div>
                            </div>
                            <button onClick={() => auth.signOut()} className="text-[10px] font-bold text-slate-500 hover:text-red-400">Đăng xuất</button>
                         </div>
                       )}

                       <div className="bg-amber-500/5 p-6 rounded-[32px] border border-amber-500/20 space-y-4">
                          <label className="block text-xs font-black text-amber-200 uppercase tracking-widest">Mật mã lớp học mới (Firebase)</label>
                          <input 
                            type="text" 
                            id="class-password-input"
                            placeholder="Nhập mật mã mới..."
                            className="w-full p-4 bg-slate-950/50 rounded-2xl border border-white/5 text-white focus:border-amber-500 focus:outline-none transition-all font-mono"
                          />
                          <p className="text-[10px] text-amber-200/40 italic">Lưu ý: Sau khi lưu, mật mã này sẽ được đồng bộ lên Firebase và thay thế mật mã hiện tại.</p>
                       </div>
                    </div>
                  )}

                  <div className="pt-8 border-t border-white/5">
                    <h4 className="font-black text-white mb-6 flex items-center gap-2 uppercase tracking-widest text-sm">
                       <Rocket size={18} className="text-sky-400 shadow-sky-400/50" />
                       Cẩm nang thiết lập Trạm Dữ Liệu
                    </h4>
                    
                    <div className="space-y-8">
                      <div className="bg-slate-900/50 p-6 rounded-[32px] border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                          <h5 className="text-xs font-black text-sky-400 uppercase tracking-widest">Bước 1: Chuẩn bị Google Sheet</h5>
                        </div>
                        <div className="text-xs text-slate-400 space-y-3 font-medium">
                          <p>Tạo Google Sheet, thêm 4 Tab (trang tính) với tên chính xác sau (Lưu ý viết đúng dấu):</p>
                          <ul className="grid grid-cols-2 gap-2 mt-2">
                            <li className="bg-sky-500/20 p-2 rounded-lg text-center font-bold text-sky-400 border border-sky-400/20">Phiếu Bài Tập</li>
                            <li className="bg-violet-500/20 p-2 rounded-lg text-center font-bold text-violet-400 border border-violet-400/20">Kiểm Tra</li>
                            <li className="bg-yellow-500/20 p-2 rounded-lg text-center font-bold text-yellow-400 border border-yellow-400/20">Đề Thi Thử</li>
                            <li className="bg-orange-500/20 p-2 rounded-lg text-center font-bold text-orange-400 border border-orange-400/20">Trò Chơi</li>
                          </ul>
                          <p className="mt-4">📋 <b>Dòng 1</b> của mỗi Tab là tiêu đề cột. Điền dữ liệu từ <b>Dòng 2</b>:</p>
                          <div className="bg-slate-950 p-3 rounded-xl border border-white/5 font-mono text-[10px] text-sky-300">
                             Tiêu đề | Mô tả | Đường dẫn | Độ khó
                          </div>
                          
                          <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
                             <p className="text-orange-400 font-black uppercase mb-2">💡 Mẹo: Dữ liệu mẫu</p>
                             <p className="mb-3">Nếu chưa biết điền gì, hãy nhấn nút dưới để lấy dữ liệu mẫu cho Tab "Phiếu Bài Tập":</p>
                             <button 
                               onClick={() => {
                                 const sample = "Phép cộng phạm vi 10\tLuyện tập cơ bản\thttps://google.com\tDễ\nPhép trừ phạm vi 10\tLuyện tập cơ bản\thttps://google.com\tDễ";
                                 navigator.clipboard.writeText(sample);
                                 alert("Đã sao chép 2 dòng mẫu! Hãy dán vào dòng 2 của Tab 'Phiếu Bài Tập'.");
                               }}
                               className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-bold text-[10px] transition-all"
                             >
                               Sao chép dữ liệu mẫu (2 dòng)
                             </button>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/50 p-6 rounded-[32px] border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                          <h5 className="text-xs font-black text-orange-400 uppercase tracking-widest">Bước 2: Cấu hình Apps Script</h5>
                          <button 
                            onClick={() => {
                              const script = `function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = { 'worksheets': 'Phiếu Bài Tập', 'unitTests': 'Kiểm Tra', 'mockExams': 'Đề Thi Thử', 'games': 'Trò Chơi' };
  const result = {};
  
  for (const [key, name] of Object.entries(sheets)) {
    try {
      const sheet = ss.getSheetByName(name);
      const data = [];
      if (sheet) {
        const rows = sheet.getDataRange().getValues();
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (r[0] && r[0].toString().trim() !== "") {
            data.push({
              id: 'id-' + key + '-' + i,
              title: r[0].toString(),
              description: r[1] ? r[1].toString() : '',
              url: r[2] ? r[2].toString() : '',
              difficulty: r[3] ? r[3].toString() : 'Dễ',
              type: key === 'worksheets' ? 'worksheet' : (key === 'unitTests' ? 'unit_test' : (key === 'mockExams' ? 'mock_exam' : 'game'))
            });
          }
        }
      }
      result[key] = data;
    } catch (e) {
      result[key] = []; // Return empty array if error
    }
  }
  
  const output = JSON.stringify(result);
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JSON);
}`;
                              navigator.clipboard.writeText(script);
                              alert("Đã sao chép bộ mã siêu cấp! Hãy dán vào Apps Script của Chỉ huy.");
                            }}
                            className="text-[10px] bg-sky-500 hover:bg-sky-400 text-white px-3 py-1.5 rounded-lg font-bold"
                          >
                            Sao chép bộ mã siêu cấp
                          </button>
                        </div>
                        <div className="text-xs text-slate-400 space-y-2">
                           <p>1. Tại Google Sheet: <b>Tiện ích mở rộng</b> &gt; <b>Apps Script</b>.</p>
                           <p>2. Xóa hết mã cũ, dán bộ mã vừa sao chép ở trên vào.</p>
                           <p>3. Nhấn <b>Triển khai</b> (Deploy) &gt; <b>Tạo bản triển khai mới</b>.</p>
                           <p>4. Chọn: <b>Ứng dụng web</b>, Quyền truy cập: <b>Bất kỳ ai (Anyone)</b>.</p>
                           <p>5. Sao chép URL nhận được và dán vào ô tọa độ tương ứng trên chiếc tàu này.</p>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-[10px] text-slate-600 mt-12 text-center font-bold italic">
                      Dữ liệu được đồng bộ hóa tức thì từ Google Sheet của Chỉ huy.
                    </p>
                  </div>
                </div>
             </motion.div>
          )}
        </AnimatePresence>

        {/* Modals outside AnimatePresence to avoid "wait" mode conflicts */}
        <AnimatePresence>
          {showPasswordModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-slate-800 border border-white/10 rounded-[32px] p-8 max-w-sm w-full shadow-2xl relative overflow-hidden"
              >
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl" />
                
                <h3 className="text-xl font-black text-white mb-2 uppercase tracking-widest relative z-10">Mã bảo vệ</h3>
                <p className="text-slate-400 mb-6 italic text-sm relative z-10">Vui lòng nhập mật mã của chỉ huy.</p>
                <form onSubmit={handlePasswordSubmit} className="relative z-10">
                  <input 
                    type="password"
                    autoFocus
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError(false);
                    }}
                    className={`w-full p-4 rounded-2xl border-2 mb-2 focus:outline-none transition-all font-mono tracking-[0.5em] text-center ${passwordError ? 'border-red-500/50 bg-red-500/10 text-red-200' : 'border-white/5 bg-slate-900/50 focus:border-sky-500 text-white'}`}
                    placeholder="••••••••"
                  />
                  {passwordError && <p className="text-red-500 text-xs font-bold mb-4 text-center">Tọa độ mật mã không chính xác!</p>}
                  <div className="flex gap-3 mt-4">
                    <button 
                      type="button" 
                      onClick={() => setShowPasswordModal(false)}
                      className="flex-1 py-3 font-bold text-slate-500 hover:text-white transition-colors"
                    >
                      Hủy
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 bg-sky-500 text-white rounded-xl py-3 font-black uppercase tracking-widest hover:bg-sky-600 shadow-lg shadow-sky-500/20 transition-all active:scale-95"
                    >
                      Xác nhận
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {diagnosticResult && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-slate-800 border-2 border-white/10 rounded-[32px] p-8 max-w-2xl w-full shadow-2xl relative overflow-hidden"
              >
                <div className={`p-4 rounded-2xl mb-6 flex items-start gap-4 ${diagnosticResult.status === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                  {diagnosticResult.status === 'ok' ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}
                  <div>
                    <h3 className="font-black uppercase tracking-widest mb-1">Kết quả kiểm tra tín hiệu G{diagnosticResult.grade}</h3>
                    <p className="text-sm font-medium opacity-80">{diagnosticResult.message}</p>
                  </div>
                </div>

                <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5 mb-6 max-h-[300px] overflow-auto">
                    <p className="text-[10px] uppercase font-black text-slate-600 mb-2 tracking-widest">Dữ liệu nhận được (Raw JSON):</p>
                    <pre className="text-xs font-mono text-sky-300 whitespace-pre-wrap">
                        {typeof diagnosticResult.data === 'object' 
                          ? JSON.stringify(diagnosticResult.data, null, 2) 
                          : String(diagnosticResult.data)}
                    </pre>
                </div>

                <div className="flex justify-end">
                   <button 
                     onClick={() => setDiagnosticResult(null)}
                     className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all"
                   >
                     Đóng bảng chuẩn đoán
                   </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Disclaimer Footer */}
        <div className="mt-16 pt-8 border-t border-white/5 text-center px-6">
          <p className="text-[10px] md:text-sm font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
            Nội dung trên ứng dụng này chỉ dành cho học tập - hoàn toàn miễn phí <br />
            và không mang tính thương mại - sử dụng nội bộ
          </p>
          <div className="mt-4 flex items-center justify-center gap-4 opacity-30">
            <div className="w-12 h-px bg-slate-700" />
            <Sparkles size={12} className="text-sky-500" />
            <div className="w-12 h-px bg-slate-700" />
          </div>
        </div>
      </main>
    </div>
  );
}

function GradeCard({ grade, onClick }: { grade: Grade; onClick: () => void; [key: string]: any }) {
  return (
    <motion.button
      whileHover={{ y: -12, scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`
        relative aspect-square md:aspect-auto md:h-80 w-full rounded-[48px] flex flex-col items-center justify-center gap-4 text-white shadow-2xl overflow-hidden group
        ${getGradeColor(grade)} border-4 border-white/5
      `}
    >
      <div className="absolute top-4 right-6 opacity-10 transform -rotate-12 group-hover:rotate-12 transition-transform duration-500">
        <Rocket size={100} fill="white" />
      </div>
      <div className="absolute bottom-4 left-6 opacity-10">
        <Moon size={60} fill="white" />
      </div>
      <span className="text-7xl md:text-9xl font-black drop-shadow-2xl">{grade}</span>
      <span className="text-xl font-black uppercase tracking-[0.2em] bg-black/20 px-6 py-2 rounded-2xl backdrop-blur-md border border-white/10">Grade {grade}</span>
    </motion.button>
  );
}

function ModuleSection({ title, icon, modules, onSelect, color }: { 
  title: string; 
  icon: React.ReactNode; 
  modules: ContentModule[]; 
  onSelect: (m: ContentModule) => void;
  color: string;
  [key: string]: any;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2 px-2">
        <div className={`p-3 rounded-2xl ${color} shadow-inner`}>{icon}</div>
        <h3 className="text-xl font-black text-white uppercase tracking-wide">{title}</h3>
      </div>
      {modules.length > 0 ? (
        <div className="space-y-3">
          {modules.map((m, idx) => (
            <motion.button
              key={m.id || `${m.title}-${idx}`}
              whileHover={{ x: 10, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(m)}
              className="w-full bg-white/5 backdrop-blur-sm p-6 rounded-[32px] flex items-center justify-between text-left shadow-lg border border-white/5 hover:border-sky-500/50 group transition-all"
            >
              <div>
                <p className="font-bold text-lg text-white group-hover:text-sky-400 transition-colors">{m.title}</p>
                <p className="text-sm text-slate-400 group-hover:text-slate-300">{m.description}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-2xl group-hover:bg-sky-500 group-hover:text-white transition-all shadow-md">
                 <Zap size={20} />
              </div>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="bg-white/5 backdrop-blur-sm p-8 rounded-[32px] border-2 border-dashed border-white/10 text-center text-slate-500 font-medium">
           Khoang này đang trống...
        </div>
      )}
    </div>
  );
}

function getGradeColor(grade: Grade) {
  const colors = {
    1: 'bg-gradient-to-br from-indigo-500 to-purple-700',
    2: 'bg-gradient-to-br from-blue-500 to-indigo-700',
    3: 'bg-gradient-to-br from-sky-500 to-blue-700',
    4: 'bg-gradient-to-br from-violet-500 to-fuchsia-700',
    5: 'bg-gradient-to-br from-fuchsia-500 to-pink-700',
  };
  return colors[grade];
}
