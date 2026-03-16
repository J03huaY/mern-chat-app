import Navbar from "./components/Navbar"
import { Routes, Route, Navigate} from "react-router-dom"

import HomePage from "./pages/HomePage";
import SignUpPage from "./pages/SignUpPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import { axiosInstance } from "./lib/axios";
import { useAuthStore } from "./store/useAuthStore";
import { useThemeStore } from "./store/useThemeStore";
import {useEffect} from "react";
import {Loader} from "lucide-react"
import {Toaster} from "react-hot-toast";

const App = () => {
  const { authUser, checkAuth, isCheckingAuth, onlineUsers } = useAuthStore()
  const { theme } = useThemeStore();

  console.log({ onlineUsers });

  useEffect(() => {
    checkAuth()
  }, [checkAuth]);

  console.log({authUser});

  // App.jsx
if (isCheckingAuth && !authUser) return (
  <div className="flex items-center justify-center h-screen">
    {/* Add this massive text so we know for sure! */}
    <h1 className="text-4xl text-black font-bold">LOADING PLEASE WAIT...</h1> 
    <Loader className="size-10 animate-spin"></Loader>
  </div>
);

// Inside App.jsx
return (
  //for page theme
  <div data-theme={theme} className="bg-base-100 text-base-content h-screen">
    <Navbar /> 
    <Routes>
      <Route path="/" element={authUser ? <HomePage /> : <Navigate to="/login" />} />
      <Route path="/signup" element={!authUser ? <SignUpPage/> : <Navigate to="/"/>} />
      <Route path="/login" element={!authUser ? <LoginPage/> : <Navigate to="/" />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/profile" element={authUser ? <ProfilePage/> : <Navigate to="/login" />} />
    </Routes>
    <Toaster />
  </div>
);
};

export default App;
