'use client';

import { useState, useEffect, useCallback } from 'react';

export function useSettingsUsers({ activeSection }) {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } else if (res.status === 403) {
        setUsersError('權限不足，僅管理員可檢視使用者列表');
      } else {
        setUsersError('取得使用者列表失敗');
      }
    } catch {
      setUsersError('取得使用者列表失敗');
    }
    setUsersLoading(false);
  }, []);

  useEffect(() => {
    if (activeSection === 'users') {
      fetchUsers();
    }
  }, [activeSection, fetchUsers]);

  return {
    users,
    usersLoading,
    usersError,
    fetchUsers,
  };
}
