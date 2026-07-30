import { CustomTab } from '../types';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  iconName: string;
  isCustom?: boolean;
  customSlug?: string;
}

export interface NavCategory {
  id: string;
  label: string;
  items: NavItem[];
}

export const DEFAULT_NAV_GROUPS: NavCategory[] = [
  {
    id: 'cat_overview',
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard',   iconName: 'LayoutDashboard', path: '/dashboard' },
      { id: 'stats',     label: 'Performance', iconName: 'Activity',        path: '/stats'     },
    ],
  },
  {
    id: 'cat_storage',
    label: 'Storage',
    items: [
      { id: 'pools',     label: 'Storage Pools', iconName: 'Database', path: '/pools'     },
      { id: 'datasets',  label: 'Datasets',      iconName: 'Layers',   path: '/datasets'  },
      { id: 'snapshots', label: 'Snapshots',      iconName: 'Camera',   path: '/snapshots' },
    ],
  },
  {
    id: 'cat_modules',
    label: 'Modules',
    items: [
      { id: 'store',   label: 'Store',          iconName: 'Store',  path: '/store'   },
      { id: 'modules', label: 'Active Modules', iconName: 'Blocks', path: '/modules' },
    ],
  },
  {
    id: 'cat_system',
    label: 'System',
    items: [
      { id: 'logs',          label: 'System Logs',   iconName: 'FileText', path: '/logs'          },
      { id: 'notifications', label: 'Notifications', iconName: 'Bell',     path: '/notifications' },
      { id: 'settings',      label: 'Settings',      iconName: 'Settings', path: '/settings'      },
    ],
  },
];

const STORAGE_KEY = 'zfs_nav_layout';

export function getNavLayout(): NavCategory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NAV_GROUPS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to parse nav layout from localStorage:', err);
  }
  return DEFAULT_NAV_GROUPS;
}

export function saveNavLayout(layout: NavCategory[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch (err) {
    console.warn('Failed to save nav layout to localStorage:', err);
  }
  window.dispatchEvent(new CustomEvent('zfs_nav_updated'));
}

export function resetNavLayout(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('zfs_nav_updated'));
}

export function syncCustomTabsToLayout(customTabs: CustomTab[]): NavCategory[] {
  const currentLayout = getNavLayout();
  let modified = false;

  // Existing custom slugs from backend
  const validSlugs = new Set(customTabs.map(t => t.slug));

  // 1. Remove deleted custom tabs from layout
  const cleanedLayout = currentLayout.map(cat => ({
    ...cat,
    items: cat.items.filter(item => {
      if (item.isCustom) {
        if (!item.customSlug || !validSlugs.has(item.customSlug)) {
          modified = true;
          return false;
        }
      }
      return true;
    }),
  }));

  // Find custom items already present in layout
  const presentCustomSlugs = new Set<string>();
  cleanedLayout.forEach(cat => {
    cat.items.forEach(item => {
      if (item.isCustom && item.customSlug) {
        presentCustomSlugs.add(item.customSlug);
      }
    });
  });

  // 2. Add missing custom tabs into the layout
  const missingTabs = customTabs.filter(t => !presentCustomSlugs.has(t.slug));

  if (missingTabs.length > 0) {
    modified = true;
    // Look for a category named "Custom Tabs" or "Overview", or use the first category
    let targetCategory = cleanedLayout.find(c => c.label.toLowerCase().includes('custom'))
      || cleanedLayout[0];

    if (!targetCategory) {
      targetCategory = { id: 'cat_custom', label: 'Tabs', items: [] };
      cleanedLayout.push(targetCategory);
    }

    missingTabs.forEach(t => {
      targetCategory.items.push({
        id: `custom_${t.slug}`,
        label: t.name,
        path: `/custom/${t.slug}`,
        iconName: 'Blocks',
        isCustom: true,
        customSlug: t.slug,
      });
    });
  }

  if (modified) {
    saveNavLayout(cleanedLayout);
  }

  return cleanedLayout;
}
