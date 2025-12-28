import { Link } from 'react-router-dom';

export interface NavLink {
  label: string;
  href: string;
  active?: boolean;
}

interface NavHeaderProps {
  title?: string;
  links?: NavLink[];
  currentPath?: string;
}

export function NavHeader({
  title = 'Corpus',
  links = [],
  currentPath = '/',
}: NavHeaderProps) {
  return (
    <header className="nav-header">
      <div className="nav-header__inner">
        <h1 className="nav-header__title">
          <Link to="/">{title}</Link>
        </h1>
        {links.length > 0 && (
          <nav>
            <ul className="nav-header__links">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className={
                      link.active || link.href === currentPath ? 'active' : undefined
                    }
                    aria-current={
                      link.active || link.href === currentPath ? 'page' : undefined
                    }
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}
