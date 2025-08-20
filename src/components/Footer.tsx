const Footer = () => (
  <footer className="border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} Polymarket Statistics</span>
          <div className="flex items-center gap-4">
            <a href="#" className="transition hover:text-slate-300">Twitter</a>
            <a href="#" className="transition hover:text-slate-300">GitHub</a>
            <a href="#" className="transition hover:text-slate-300">Docs</a>
          </div>
        </div>
    </footer>
);

export default Footer;