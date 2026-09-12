/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Search, Bookmark, Highlighter, Settings, User as UserIcon, LogIn, LogOut, 
  ChevronLeft, ChevronRight, BookOpen, Sun, Moon, Eye, X, Check, Trash2, Globe, Sparkles, Calendar, Share2
} from 'lucide-react';
import { BIBLE_BOOKS, getChapterVerses, BibleVerse, BibleBook } from './data/bibleData';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User, db, collection, doc, setDoc, deleteDoc, getDocs, query, where } from './firebase';

interface BookmarkItem {
  id: string;
  bookId: string;
  bookName: string;
  chapter: number;
  verse?: number | null;
  snippet?: string;
  createdAt: number;
}

interface HighlightItem {
  id: string;
  bookId: string;
  chapter: number;
  verse: number;
  color: 'yellow' | 'green' | 'blue' | 'pink';
  text: string;
  createdAt: number;
}

const DAILY_VERSES = [
  { bookId: 'psa', bookName: 'Psalms', chapter: 23, verse: 1, text: "The LORD is my shepherd; I shall not want.", bg: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80" },
  { bookId: 'pro', bookName: 'Proverbs', chapter: 3, verse: 5, text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding.", bg: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=80" },
  { bookId: 'jhn', bookName: 'John', chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.", bg: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=80" },
  { bookId: 'rom', bookName: 'Romans', chapter: 8, verse: 28, text: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.", bg: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=1600&q=80" },
  { bookId: 'php', bookName: 'Philippians', chapter: 4, verse: 13, text: "I can do all things through Christ which strengtheneth me.", bg: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=80" },
  { bookId: 'jhn', bookName: 'John', chapter: 14, verse: 6, text: "Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.", bg: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=80" },
  { bookId: 'isa', bookName: 'Isaiah', chapter: 40, verse: 31, text: "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.", bg: "https://images.unsplash.com/photo-1426604966848-d7adacbd02bff?auto=format&fit=crop&w=1600&q=80" }
];

export default function App() {
  // Navigation State
  const [selectedBook, setSelectedBook] = useState<BibleBook>(BIBLE_BOOKS[0]); // Genesis
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [verses, setVerses] = useState<BibleVerse[]>([]);

  // User Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // User Data (Firestore synced when signed in)
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);

  // Modals & Panels
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<{ bookId: string; bookName: string; chapter: number; verse: number; text: string }[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState<boolean>(false);
  const [bookmarksTab, setBookmarksTab] = useState<'bookmarks' | 'highlights'>('bookmarks');
  
  // Verse interactive action menu (for mobile & desktop tapping/clicking verses)
  const [activeVerseMenu, setActiveVerseMenu] = useState<{ verseNum: number; verseText: string } | null>(null);

  // Verse of the Day modal state (shown on startup)
  const [isVerseOfTheDayOpen, setIsVerseOfTheDayOpen] = useState<boolean>(true);

  // Reading Settings
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg' | 'xl' | '2xl'>('lg');
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans' | 'mono'>('serif');
  const [theme, setTheme] = useState<'light' | 'sepia' | 'dark' | 'oled'>('light');
  const [signInPrompt, setSignInPrompt] = useState<boolean>(false);

  // Compute today's verse deterministically based on local device date string
  const getTodayVerse = () => {
    const todayStr = new Date().toDateString();
    let hash = 0;
    for (let i = 0; i < todayStr.length; i++) {
      hash = todayStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % DAILY_VERSES.length;
    return DAILY_VERSES[index];
  };

  const todayVerse = getTodayVerse();

  // Auth observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        await fetchUserData(currentUser.uid);
      } else {
        setBookmarks([]);
        setHighlights([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch bookmarks and highlights from Firestore
  const fetchUserData = async (uid: string) => {
    try {
      const bmSnap = await getDocs(query(collection(db, 'users', uid, 'bookmarks')));
      const bmList: BookmarkItem[] = [];
      bmSnap.forEach((docSnap) => {
        bmList.push({ id: docSnap.id, ...docSnap.data() } as BookmarkItem);
      });
      setBookmarks(bmList);

      const hlSnap = await getDocs(query(collection(db, 'users', uid, 'highlights')));
      const hlList: HighlightItem[] = [];
      hlSnap.forEach((docSnap) => {
        hlList.push({ id: docSnap.id, ...docSnap.data() } as HighlightItem);
      });
      setHighlights(hlList);
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  };

  // Load verses when book or chapter changes
  useEffect(() => {
    const v = getChapterVerses(selectedBook.id, selectedChapter);
    setVerses(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedBook, selectedChapter]);

  // Handle Google Sign-In
  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setSignInPrompt(false);
    } catch (err) {
      console.error('Sign-in error:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  // Toggle Bookmark
  const toggleBookmark = async (verseNum?: number | null) => {
    if (!user) {
      setSignInPrompt(true);
      return;
    }

    const id = verseNum 
      ? `${selectedBook.id}_c${selectedChapter}_v${verseNum}` 
      : `${selectedBook.id}_c${selectedChapter}`;
    
    const existing = bookmarks.find(b => b.id === id);

    try {
      if (existing) {
        await deleteDoc(doc(db, 'users', user.uid, 'bookmarks', id));
        setBookmarks(prev => prev.filter(b => b.id !== id));
      } else {
        const newBm: BookmarkItem = {
          id,
          bookId: selectedBook.id,
          bookName: selectedBook.name,
          chapter: selectedChapter,
          verse: verseNum ?? null,
          snippet: verseNum ? verses.find(v => v.verse === verseNum)?.text : `${selectedBook.name} Chapter ${selectedChapter}`,
          createdAt: Date.now()
        };
        await setDoc(doc(db, 'users', user.uid, 'bookmarks', id), newBm);
        setBookmarks(prev => [newBm, ...prev]);
      }
    } catch (err) {
      console.error('Error updating bookmark:', err);
    }
  };

  // Add/Update Highlight
  const handleHighlight = async (verseNum: number, color: 'yellow' | 'green' | 'blue' | 'pink') => {
    if (!user) {
      setSignInPrompt(true);
      setActiveVerseMenu(null);
      return;
    }

    const id = `${selectedBook.id}_c${selectedChapter}_v${verseNum}`;
    const verseObj = verses.find(v => v.verse === verseNum);
    if (!verseObj) return;

    try {
      const newHl: HighlightItem = {
        id,
        bookId: selectedBook.id,
        chapter: selectedChapter,
        verse: verseNum,
        color,
        text: verseObj.text,
        createdAt: Date.now()
      };
      await setDoc(doc(db, 'users', user.uid, 'highlights', id), newHl);
      setHighlights(prev => [...prev.filter(h => h.id !== id), newHl]);
      setActiveVerseMenu(null);
    } catch (err) {
      console.error('Error saving highlight:', err);
    }
  };

  const removeHighlight = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'highlights', id));
      setHighlights(prev => prev.filter(h => h.id !== id));
      setActiveVerseMenu(null);
    } catch (err) {
      console.error('Error removing highlight:', err);
    }
  };

  const removeBookmark = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'bookmarks', id));
      setBookmarks(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error('Error removing bookmark:', err);
    }
  };

  // Search execution
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const q = searchQuery.toLowerCase();
    const results: { bookId: string; bookName: string; chapter: number; verse: number; text: string }[] = [];

    for (const book of BIBLE_BOOKS.slice(0, 25)) {
      for (let c = 1; c <= Math.min(book.chapters, 5); c++) {
        const vList = getChapterVerses(book.id, c);
        for (const v of vList) {
          if (v.text.toLowerCase().includes(q)) {
            results.push({
              bookId: book.id,
              bookName: book.name,
              chapter: c,
              verse: v.verse,
              text: v.text
            });
            if (results.length >= 30) break;
          }
        }
        if (results.length >= 30) break;
      }
      if (results.length >= 30) break;
    }
    setSearchResults(results);
  }, [searchQuery]);

  // Theme styles
  const getThemeClasses = () => {
    switch (theme) {
      case 'sepia':
        return 'bg-[#f4ecd8] text-[#5c4033]';
      case 'dark':
        return 'bg-[#18181b] text-[#f4f4f5]';
      case 'oled':
        return 'bg-black text-neutral-100';
      default:
        return 'bg-[#fafaf9] text-neutral-900';
    }
  };

  const getHeaderClasses = () => {
    switch (theme) {
      case 'sepia':
        return 'bg-[#eae0c8] border-[#d6cbaf] text-[#5c4033]';
      case 'dark':
        return 'bg-[#27272a] border-[#3f3f46] text-white';
      case 'oled':
        return 'bg-neutral-900 border-neutral-800 text-white';
      default:
        return 'bg-white border-neutral-200 text-neutral-900';
    }
  };

  const getCardClasses = () => {
    switch (theme) {
      case 'sepia':
        return 'bg-[#fcf8ed] border-[#e6dcce]';
      case 'dark':
        return 'bg-[#202023] border-[#2f2f35]';
      case 'oled':
        return 'bg-neutral-900 border-neutral-800';
      default:
        return 'bg-white border-neutral-200 shadow-sm';
    }
  };

  const getFontFamilyClass = () => {
    switch (fontFamily) {
      case 'sans':
        return 'font-sans';
      case 'mono':
        return 'font-mono';
      default:
        return 'font-serif';
    }
  };

  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'sm':
        return 'text-sm leading-relaxed';
      case 'md':
        return 'text-base leading-relaxed';
      case 'xl':
        return 'text-xl leading-loose';
      case '2xl':
        return 'text-2xl leading-loose';
      default:
        return 'text-lg leading-loose';
    }
  };

  const isCurrentChapterBookmarked = bookmarks.some(
    b => b.bookId === selectedBook.id && b.chapter === selectedChapter && !b.verse
  );

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${getThemeClasses()}`}>
      
      {/* Top Navigation Bar */}
      <header className={`sticky top-0 z-30 border-b px-4 py-3 flex items-center justify-between shadow-xs ${getHeaderClasses()}`}>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-lg bg-amber-600 flex items-center justify-center text-white shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base md:text-lg tracking-tight">KJV Holy Bible</h1>
              <p className="text-xs opacity-70 hidden sm:block">King James Version • Authorized 1611</p>
            </div>
          </div>
        </div>

        {/* Quick Jump Selectors */}
        <div className="flex items-center space-x-2">
          <select 
            value={selectedBook.id} 
            onChange={(e) => {
              const b = BIBLE_BOOKS.find(item => item.id === e.target.value);
              if (b) {
                setSelectedBook(b);
                setSelectedChapter(1);
              }
            }}
            className={`text-xs md:text-sm font-medium px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer ${
              theme === 'dark' || theme === 'oled' ? 'bg-neutral-800 border-neutral-700 text-white' : 
              theme === 'sepia' ? 'bg-[#f4ecd8] border-[#d6cbaf] text-[#5c4033]' : 'bg-neutral-50 border-neutral-300 text-neutral-800'
            }`}
          >
            <optgroup label="Old Testament">
              {BIBLE_BOOKS.filter(b => b.testament === 'Old').map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </optgroup>
            <optgroup label="New Testament">
              {BIBLE_BOOKS.filter(b => b.testament === 'New').map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </optgroup>
          </select>

          <select 
            value={selectedChapter} 
            onChange={(e) => setSelectedChapter(Number(e.target.value))}
            className={`text-xs md:text-sm font-medium px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer ${
              theme === 'dark' || theme === 'oled' ? 'bg-neutral-800 border-neutral-700 text-white' : 
              theme === 'sepia' ? 'bg-[#f4ecd8] border-[#d6cbaf] text-[#5c4033]' : 'bg-neutral-50 border-neutral-300 text-neutral-800'
            }`}
          >
            {Array.from({ length: selectedBook.chapters }, (_, i) => i + 1).map(c => (
              <option key={c} value={c}>Ch {c}</option>
            ))}
          </select>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1.5 md:space-x-2">
          <button 
            onClick={() => setIsVerseOfTheDayOpen(true)}
            title="Verse of the Day"
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center space-x-1 text-amber-600 dark:text-amber-400 font-medium"
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-xs hidden md:inline">Daily Verse</span>
          </button>

          <button 
            onClick={() => setIsSearchOpen(true)}
            title="Search Bible"
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center space-x-1"
          >
            <Search className="w-5 h-5" />
            <span className="text-xs hidden lg:inline">Search</span>
          </button>

          <button 
            onClick={() => {
              if (!user) {
                setSignInPrompt(true);
              } else {
                setIsBookmarksOpen(true);
              }
            }}
            title="Bookmarks & Highlights"
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors relative flex items-center space-x-1"
          >
            <Bookmark className="w-5 h-5" />
            {(bookmarks.length > 0 || highlights.length > 0) && user && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500"></span>
            )}
            <span className="text-xs hidden lg:inline">Library</span>
          </button>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            title="Reading Settings"
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Auth Button */}
          {authLoading ? (
            <div className="w-8 h-8 rounded-full animate-pulse bg-neutral-300 dark:bg-neutral-700"></div>
          ) : user ? (
            <div className="flex items-center space-x-2 pl-2 border-l border-neutral-300 dark:border-neutral-700">
              <img 
                src={user.photoURL || undefined} 
                alt={user.displayName || 'User'} 
                className="w-8 h-8 rounded-full border border-amber-500 object-cover"
                title={user.displayName || user.email || ''}
              />
              <button 
                onClick={handleSignOut}
                title="Sign Out"
                className="p-1.5 rounded-lg text-xs hover:bg-red-500/10 text-red-600 dark:text-red-400 transition-colors hidden sm:flex items-center space-x-1"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button 
              onClick={handleGoogleSignIn}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs md:text-sm font-medium shadow-xs transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Reading Canvas */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 md:py-12">
        
        {/* Chapter Header Card */}
        <div className={`p-6 rounded-2xl mb-8 border transition-all ${getCardClasses()} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider opacity-60 mb-1">
              <span>{selectedBook.testament} Testament</span>
              <span>•</span>
              <span>{selectedBook.name}</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              {selectedBook.name} {selectedChapter}
            </h2>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button 
              onClick={() => toggleBookmark(null)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                isCurrentChapterBookmarked 
                  ? 'bg-amber-500 text-white border-amber-500' 
                  : 'hover:bg-black/5 dark:hover:bg-white/10 border-current/20'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isCurrentChapterBookmarked ? 'fill-current' : ''}`} />
              <span>{isCurrentChapterBookmarked ? 'Bookmarked Chapter' : 'Bookmark Chapter'}</span>
            </button>
          </div>
        </div>

        {/* Notice for non-signed in users */}
        {!user && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-center justify-between text-xs sm:text-sm">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Sign in with Google to enable cloud-synced verse highlighting and personal bookmarks.</span>
            </div>
            <button 
              onClick={handleGoogleSignIn}
              className="ml-2 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium whitespace-nowrap shadow-xs transition-colors"
            >
              Sign In
            </button>
          </div>
        )}

        <div className="mb-4 text-xs opacity-60 italic flex items-center justify-between">
          <span>💡 Tap or click any verse to highlight in color or bookmark.</span>
        </div>

        {/* Verses List */}
        <div className={`space-y-4 ${getFontFamilyClass()} ${getFontSizeClass()}`}>
          {verses.map((v) => {
            const hl = highlights.find(h => h.bookId === selectedBook.id && h.chapter === selectedChapter && h.verse === v.verse);
            
            let highlightBg = '';
            if (hl) {
              switch (hl.color) {
                case 'yellow': highlightBg = 'bg-yellow-200/70 dark:bg-yellow-950/70 border-l-4 border-yellow-500 pl-2 rounded-r-lg'; break;
                case 'green': highlightBg = 'bg-emerald-200/70 dark:bg-emerald-950/70 border-l-4 border-emerald-500 pl-2 rounded-r-lg'; break;
                case 'blue': highlightBg = 'bg-sky-200/70 dark:bg-sky-950/70 border-l-4 border-sky-500 pl-2 rounded-r-lg'; break;
                case 'pink': highlightBg = 'bg-rose-200/70 dark:bg-rose-950/70 border-l-4 border-rose-500 pl-2 rounded-r-lg'; break;
              }
            }

            return (
              <div 
                key={v.verse} 
                onClick={() => setActiveVerseMenu({ verseNum: v.verse, verseText: v.text })}
                className={`group relative p-2.5 -mx-2 rounded-xl transition-all cursor-pointer hover:bg-amber-500/5 dark:hover:bg-amber-500/10 ${highlightBg}`}
              >
                <div className="flex items-start justify-between">
                  <div className="pr-6">
                    <span className="text-xs font-bold opacity-50 mr-2 select-none align-super">
                      {v.verse}
                    </span>
                    <span>{v.text}</span>
                  </div>

                  {/* Desktop Hover Quick Highlighters */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex items-center space-x-1 shrink-0 ml-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleHighlight(v.verse, 'yellow'); }}
                      title="Highlight Yellow"
                      className="w-5 h-5 rounded-full bg-yellow-300 border border-yellow-400 shadow-xs hover:scale-110 transition-transform"
                    ></button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleHighlight(v.verse, 'green'); }}
                      title="Highlight Green"
                      className="w-5 h-5 rounded-full bg-emerald-300 border border-emerald-400 shadow-xs hover:scale-110 transition-transform"
                    ></button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleHighlight(v.verse, 'blue'); }}
                      title="Highlight Blue"
                      className="w-5 h-5 rounded-full bg-sky-300 border border-sky-400 shadow-xs hover:scale-110 transition-transform"
                    ></button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleHighlight(v.verse, 'pink'); }}
                      title="Highlight Pink"
                      className="w-5 h-5 rounded-full bg-rose-300 border border-rose-400 shadow-xs hover:scale-110 transition-transform"
                    ></button>
                    {hl && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeHighlight(hl.id); }}
                        title="Remove Highlight"
                        className="p-1 rounded hover:bg-red-500/10 text-red-500 text-xs"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chapter Navigation Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-current/10 flex items-center justify-between">
          <button 
            onClick={() => {
              if (selectedChapter > 1) {
                setSelectedChapter(selectedChapter - 1);
              } else {
                const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
                if (currentIndex > 0) {
                  const prevBook = BIBLE_BOOKS[currentIndex - 1];
                  setSelectedBook(prevBook);
                  setSelectedChapter(prevBook.chapters);
                }
              }
            }}
            disabled={selectedBook.id === 'gen' && selectedChapter === 1}
            className="flex items-center space-x-1 px-4 py-2 rounded-xl border border-current/20 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous Chapter</span>
          </button>

          <button 
            onClick={() => {
              if (selectedChapter < selectedBook.chapters) {
                setSelectedChapter(selectedChapter + 1);
              } else {
                const currentIndex = BIBLE_BOOKS.findIndex(b => b.id === selectedBook.id);
                if (currentIndex < BIBLE_BOOKS.length - 1) {
                  const nextBook = BIBLE_BOOKS[currentIndex + 1];
                  setSelectedBook(nextBook);
                  setSelectedChapter(1);
                }
              }
            }}
            disabled={selectedBook.id === 'rev' && selectedChapter === 22}
            className="flex items-center space-x-1 px-4 py-2 rounded-xl border border-current/20 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <span>Next Chapter</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </main>

      {/* Footer */}
      <footer className={`py-6 px-4 border-t text-center text-xs opacity-60 ${getHeaderClasses()}`}>
        <p>KJV Holy Bible Reader • Authorized King James Version • Built with React & Tailwind</p>
      </footer>

      {/* Verse Action Dialog (Mobile & Click friendly) */}
      {activeVerseMenu && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className={`w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl border p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 ${getCardClasses()}`}>
            <div className="flex items-center justify-between border-b border-current/10 pb-3">
              <h3 className="font-bold text-base text-amber-600 dark:text-amber-400">
                {selectedBook.name} {selectedChapter}:{activeVerseMenu.verseNum}
              </h3>
              <button 
                onClick={() => setActiveVerseMenu(null)}
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm font-serif italic bg-black/5 dark:bg-white/5 p-3 rounded-xl">
              "{activeVerseMenu.verseText}"
            </p>

            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-70">Highlight Color</label>
              <div className="grid grid-cols-4 gap-2">
                <button 
                  onClick={() => handleHighlight(activeVerseMenu.verseNum, 'yellow')}
                  className="p-3 rounded-xl bg-yellow-300 hover:bg-yellow-400 text-yellow-900 font-semibold text-xs flex items-center justify-center shadow-xs transition-transform hover:scale-105"
                >
                  Yellow
                </button>
                <button 
                  onClick={() => handleHighlight(activeVerseMenu.verseNum, 'green')}
                  className="p-3 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-emerald-900 font-semibold text-xs flex items-center justify-center shadow-xs transition-transform hover:scale-105"
                >
                  Green
                </button>
                <button 
                  onClick={() => handleHighlight(activeVerseMenu.verseNum, 'blue')}
                  className="p-3 rounded-xl bg-sky-300 hover:bg-sky-400 text-sky-900 font-semibold text-xs flex items-center justify-center shadow-xs transition-transform hover:scale-105"
                >
                  Blue
                </button>
                <button 
                  onClick={() => handleHighlight(activeVerseMenu.verseNum, 'pink')}
                  className="p-3 rounded-xl bg-rose-300 hover:bg-rose-400 text-rose-900 font-semibold text-xs flex items-center justify-center shadow-xs transition-transform hover:scale-105"
                >
                  Pink
                </button>
              </div>

              {highlights.some(h => h.bookId === selectedBook.id && h.chapter === selectedChapter && h.verse === activeVerseMenu.verseNum) && (
                <button 
                  onClick={() => {
                    const h = highlights.find(item => item.bookId === selectedBook.id && item.chapter === selectedChapter && item.verse === activeVerseMenu.verseNum);
                    if (h) removeHighlight(h.id);
                  }}
                  className="w-full py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-medium text-xs flex items-center justify-center space-x-1"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remove Highlight</span>
                </button>
              )}
            </div>

            <div className="pt-2 border-t border-current/10 flex gap-2">
              <button 
                onClick={() => {
                  toggleBookmark(activeVerseMenu.verseNum);
                  setActiveVerseMenu(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs shadow-xs flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Bookmark className="w-4 h-4" />
                <span>Bookmark Verse</span>
              </button>
              <button 
                onClick={() => setActiveVerseMenu(null)}
                className="px-4 py-2.5 rounded-xl border border-current/20 hover:bg-black/5 dark:hover:bg-white/10 font-medium text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verse of the Day Gorgeous Welcome Modal */}
      {isVerseOfTheDayOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl relative text-white flex flex-col justify-end min-h-[460px] md:min-h-[520px]">
            {/* Background Image with Gradient Overlay */}
            <div 
              className="absolute inset-0 bg-cover bg-center transition-all duration-700 scale-105"
              style={{ backgroundImage: `url(${todayVerse.bg})` }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30"></div>

            {/* Content */}
            <div className="relative z-10 p-6 md:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold tracking-wide uppercase border border-white/30">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Verse of the Day • {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                </div>
                <button 
                  onClick={() => setIsVerseOfTheDayOpen(false)}
                  className="p-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <p className="font-serif text-xl md:text-2xl leading-relaxed font-medium text-amber-50">
                  "{todayVerse.text}"
                </p>
                <p className="text-sm font-semibold tracking-wide text-amber-300 uppercase">
                  — {todayVerse.bookName} {todayVerse.chapter}:{todayVerse.verse} (KJV)
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => {
                    const book = BIBLE_BOOKS.find(b => b.id === todayVerse.bookId);
                    if (book) {
                      setSelectedBook(book);
                      setSelectedChapter(todayVerse.chapter);
                    }
                    setIsVerseOfTheDayOpen(false);
                  }}
                  className="flex-1 py-3 px-6 rounded-2xl bg-amber-500 hover:bg-amber-600 text-neutral-950 font-bold text-sm shadow-lg transition-transform hover:scale-[1.02] flex items-center justify-center space-x-2"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Read in Chapter Context</span>
                </button>
                <button 
                  onClick={() => setIsVerseOfTheDayOpen(false)}
                  className="py-3 px-6 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 font-medium text-sm transition-colors"
                >
                  Continue to Bible
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-16 px-4">
          <div className={`w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[80vh] ${getCardClasses()}`}>
            <div className="p-4 border-b border-current/10 flex items-center justify-between">
              <div className="flex items-center space-x-2 flex-1 mr-4">
                <Search className="w-5 h-5 opacity-60" />
                <input 
                  type="text"
                  placeholder="Search Bible verses (e.g. love, peace, faith)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full bg-transparent outline-none text-base"
                />
              </div>
              <button 
                onClick={() => setIsSearchOpen(false)}
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {searchQuery.length < 2 ? (
                <div className="text-center py-12 opacity-60">
                  <p>Type at least 2 characters to search the Bible.</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-12 opacity-60">
                  <p>No verses found matching "{searchQuery}".</p>
                </div>
              ) : (
                searchResults.map((res, i) => (
                  <div 
                    key={i} 
                    onClick={() => {
                      const book = BIBLE_BOOKS.find(b => b.id === res.bookId);
                      if (book) {
                        setSelectedBook(book);
                        setSelectedChapter(res.chapter);
                        setIsSearchOpen(false);
                      }
                    }}
                    className="p-3 rounded-xl border border-current/10 hover:border-amber-500 cursor-pointer transition-all hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  >
                    <div className="flex items-center justify-between text-xs font-bold opacity-70 mb-1">
                      <span>{res.bookName} {res.chapter}:{res.verse}</span>
                      <span className="text-amber-600 dark:text-amber-400">Jump to verse →</span>
                    </div>
                    <p className="text-sm">{res.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bookmarks & Highlights Drawer */}
      {isBookmarksOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className={`w-full max-w-md h-full flex flex-col shadow-2xl border-l ${getCardClasses()}`}>
            <div className="p-4 border-b border-current/10 flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center space-x-2">
                <Bookmark className="w-5 h-5 text-amber-500" />
                <span>My Saved Library</span>
              </h3>
              <button 
                onClick={() => setIsBookmarksOpen(false)}
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-current/10 px-4 pt-2 space-x-4">
              <button 
                onClick={() => setBookmarksTab('bookmarks')}
                className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                  bookmarksTab === 'bookmarks' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent opacity-60'
                }`}
              >
                Bookmarks ({bookmarks.length})
              </button>
              <button 
                onClick={() => setBookmarksTab('highlights')}
                className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                  bookmarksTab === 'highlights' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent opacity-60'
                }`}
              >
                Highlights ({highlights.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {bookmarksTab === 'bookmarks' ? (
                bookmarks.length === 0 ? (
                  <div className="text-center py-16 opacity-60">
                    <Bookmark className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>No bookmarks saved yet.</p>
                  </div>
                ) : (
                  bookmarks.map(bm => (
                    <div key={bm.id} className="p-3 rounded-xl border border-current/10 flex items-start justify-between gap-2">
                      <div 
                        onClick={() => {
                          const book = BIBLE_BOOKS.find(b => b.id === bm.bookId);
                          if (book) {
                            setSelectedBook(book);
                            setSelectedChapter(bm.chapter);
                            setIsBookmarksOpen(false);
                          }
                        }}
                        className="cursor-pointer flex-1"
                      >
                        <h4 className="font-bold text-sm text-amber-600 dark:text-amber-400">
                          {bm.bookName} {bm.chapter}{bm.verse ? `:${bm.verse}` : ''}
                        </h4>
                        <p className="text-xs opacity-80 mt-1 line-clamp-2">{bm.snippet}</p>
                      </div>
                      <button 
                        onClick={() => removeBookmark(bm.id)}
                        className="p-1 rounded hover:bg-red-500/10 text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )
              ) : (
                highlights.length === 0 ? (
                  <div className="text-center py-16 opacity-60">
                    <Highlighter className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>No highlights saved yet.</p>
                  </div>
                ) : (
                  highlights.map(hl => {
                    const book = BIBLE_BOOKS.find(b => b.id === hl.bookId);
                    return (
                      <div key={hl.id} className="p-3 rounded-xl border border-current/10 flex items-start justify-between gap-2">
                        <div 
                          onClick={() => {
                            if (book) {
                              setSelectedBook(book);
                              setSelectedChapter(hl.chapter);
                              setIsBookmarksOpen(false);
                            }
                          }}
                          className="cursor-pointer flex-1"
                        >
                          <div className="flex items-center space-x-2 mb-1">
                            <span className={`w-3 h-3 rounded-full ${
                              hl.color === 'yellow' ? 'bg-yellow-400' :
                              hl.color === 'green' ? 'bg-emerald-400' :
                              hl.color === 'blue' ? 'bg-sky-400' : 'bg-rose-400'
                            }`}></span>
                            <h4 className="font-bold text-xs opacity-70">
                              {book?.name} {hl.chapter}:{hl.verse}
                            </h4>
                          </div>
                          <p className="text-sm">{hl.text}</p>
                        </div>
                        <button 
                          onClick={() => removeHighlight(hl.id)}
                          className="p-1 rounded hover:bg-red-500/10 text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reading Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl border p-6 space-y-6 ${getCardClasses()}`}>
            <div className="flex items-center justify-between border-b border-current/10 pb-4">
              <h3 className="font-bold text-lg flex items-center space-x-2">
                <Settings className="w-5 h-5" />
                <span>Reading Settings</span>
              </h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Theme */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-70">Theme</label>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setTheme('light')}
                  className={`p-3 rounded-xl border flex items-center justify-center space-x-2 text-sm font-medium transition-all ${
                    theme === 'light' ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-current/20'
                  }`}
                >
                  <Sun className="w-4 h-4" />
                  <span>Light</span>
                </button>
                <button 
                  onClick={() => setTheme('sepia')}
                  className={`p-3 rounded-xl border flex items-center justify-center space-x-2 text-sm font-medium transition-all ${
                    theme === 'sepia' ? 'border-amber-500 bg-[#f4ecd8] text-[#5c4033]' : 'border-current/20'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Sepia</span>
                </button>
                <button 
                  onClick={() => setTheme('dark')}
                  className={`p-3 rounded-xl border flex items-center justify-center space-x-2 text-sm font-medium transition-all ${
                    theme === 'dark' ? 'border-amber-500 bg-neutral-800 text-white' : 'border-current/20'
                  }`}
                >
                  <Moon className="w-4 h-4" />
                  <span>Dark</span>
                </button>
                <button 
                  onClick={() => setTheme('oled')}
                  className={`p-3 rounded-xl border flex items-center justify-center space-x-2 text-sm font-medium transition-all ${
                    theme === 'oled' ? 'border-amber-500 bg-black text-white' : 'border-current/20'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-black border border-white"></div>
                  <span>OLED Black</span>
                </button>
              </div>
            </div>

            {/* Font Family */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-70">Font Style</label>
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => setFontFamily('serif')}
                  className={`p-2.5 rounded-xl border font-serif text-sm font-medium transition-all ${
                    fontFamily === 'serif' ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-current/20'
                  }`}
                >
                  Serif
                </button>
                <button 
                  onClick={() => setFontFamily('sans')}
                  className={`p-2.5 rounded-xl border font-sans text-sm font-medium transition-all ${
                    fontFamily === 'sans' ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-current/20'
                  }`}
                >
                  Sans
                </button>
                <button 
                  onClick={() => setFontFamily('mono')}
                  className={`p-2.5 rounded-xl border font-mono text-sm font-medium transition-all ${
                    fontFamily === 'mono' ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-current/20'
                  }`}
                >
                  Mono
                </button>
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-70">Font Size</label>
              <div className="grid grid-cols-5 gap-1.5">
                {(['sm', 'md', 'lg', 'xl', '2xl'] as const).map(size => (
                  <button 
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={`py-2 rounded-xl border text-xs font-semibold uppercase transition-all ${
                      fontSize === size ? 'border-amber-500 bg-amber-500/10 text-amber-600' : 'border-current/20'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Sign In Prompt Modal */}
      {signInPrompt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl border p-6 text-center space-y-4 ${getCardClasses()}`}>
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-xl">Sign In Required</h3>
            <p className="text-sm opacity-80">
              Bookmarks and verse highlighting are optional features available when you sign in with your Google account. Otherwise, enjoy the clean, easy-to-navigate KJV Bible!
            </p>
            <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
              <button 
                onClick={handleGoogleSignIn}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm shadow-md transition-colors flex items-center justify-center space-x-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In with Google</span>
              </button>
              <button 
                onClick={() => setSignInPrompt(false)}
                className="px-5 py-2.5 rounded-xl border border-current/20 hover:bg-black/5 dark:hover:bg-white/10 font-medium text-sm transition-colors"
              >
                Continue Reading
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
