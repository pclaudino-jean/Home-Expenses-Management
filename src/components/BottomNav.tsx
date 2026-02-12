import { NavLink } from 'react-router-dom';
import { Users, User, Receipt } from 'lucide-react';

const navItems = [
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/activity', label: 'Activity', icon: Receipt },
  { to: '/account', label: 'Account', icon: User },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around py-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors ${
                isActive ? 'text-primary font-medium' : 'text-muted-foreground'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
