"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import { useAuthModal } from "../app/stores/useAuthModal"; // <-- NEW
import { Button } from "../components/ui/button";

const Header = () => {
  const [user, setUser] = useState<any>(null);

  // Pull modal state/handlers from the store
  const { open, mode, openLogin, openSignup, close } = useAuthModal();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <>
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 fixed top-0 left-0 w-full z-30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">PM</span>
                </div>
                <span className="font-bold text-xl text-foreground">Polymarket Statistics</span>
                <span className="text-xs bg-accent px-2 py-1 rounded-full text-accent-foreground">🇺🇸</span>
              </div>
            </div>

            {/* Auth buttons */}
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm">
                How it works
              </Button>

              {!user ? (
                <>
                  <Button variant="ghost" size="sm" onClick={openLogin}>
                    Log In
                  </Button>
                  <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={openSignup}>
                    Sign Up
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  Log Out
                </Button>
              )}

              <Button variant="ghost" size="sm">
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Auth Modal (now driven by the store) */}
      <AuthModal open={open} onClose={close} initialMode={mode} />
    </>
  );
};

export default Header;
