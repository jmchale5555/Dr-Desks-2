import { useState } from 'react';
import { Users, MapPin } from 'lucide-react';
import RoomManagement from './pages/RoomManagement';
import UserManagement from './pages/UserManagement';

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState('rooms');

  const tabs = [
    { id: 'rooms', label: 'Room Management', icon: MapPin },
    { id: 'users', label: 'User Management', icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Manage rooms, users, and system settings
        </p>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-1" aria-label="Admin sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === 'rooms' ? <RoomManagement /> : <UserManagement />}
    </div>
  );
}
