import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUsageStatsCallable, UsageStatsEntry } from '../services/firebaseService';
import '../scss/usageStats.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faUsers, faGamepad } from '@fortawesome/free-solid-svg-icons';

type TimeFilter = '7days' | '30days' | '90days' | 'alltime';
type MetricType = 'users' | 'attempts';

interface AggregatedDataPoint {
  label: string;
  date: string;
  uniqueUsers: number;
  totalAttempts: number;
}

const UsageStatsScreen: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30days');
  const [metricType, setMetricType] = useState<MetricType>('users');
  const [statsData, setStatsData] = useState<UsageStatsEntry[]>([]);
  const [totalUniqueUsers, setTotalUniqueUsers] = useState<number>(0);
  const [totalAttempts, setTotalAttempts] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate date range based on filter
  const getDateRange = (filter: TimeFilter): { startDate: string; endDate: string } => {
    const now = new Date();
    const endDate = now.toISOString().split('T')[0];

    let startDate: Date;
    switch (filter) {
      case '7days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 6); // Last 7 days = today + 6 days back
        break;
      case '30days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 29); // Last 30 days = today + 29 days back
        break;
      case '90days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 89); // Last 90 days = today + 89 days back
        break;
      case 'alltime':
        startDate = new Date('2024-01-01');
        break;
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate,
    };
  };

  // Helper to get the next cache invalidation time (12:30 AM ET)
  const getNextInvalidationTime = (): number => {
    const now = new Date();
    // Convert to ET (UTC-5 or UTC-4 depending on DST)
    const etOffset = -5 * 60; // ET is UTC-5 (standard) or UTC-4 (DST)
    const etTime = new Date(now.getTime() + (etOffset + now.getTimezoneOffset()) * 60 * 1000);

    // Set to 12:30 AM ET
    const nextInvalidation = new Date(etTime);
    nextInvalidation.setHours(0, 30, 0, 0);

    // If we're past 12:30 AM today, set to tomorrow
    if (etTime.getTime() > nextInvalidation.getTime()) {
      nextInvalidation.setDate(nextInvalidation.getDate() + 1);
    }

    // Convert back to local time
    return nextInvalidation.getTime() - (etOffset + now.getTimezoneOffset()) * 60 * 1000;
  };

  // Check if cached data is still valid
  const isCacheValid = (cacheKey: string): boolean => {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return false;

    try {
      const { timestamp } = JSON.parse(cached);
      const nextInvalidation = getNextInvalidationTime();
      return Date.now() < nextInvalidation && timestamp < nextInvalidation;
    } catch {
      return false;
    }
  };

  // Fetch data when filter changes
  useEffect(() => {
    const fetchStats = async () => {
      const { startDate, endDate } = getDateRange(timeFilter);
      const cacheKey = `usageStats_${timeFilter}_${startDate}_${endDate}`;

      // Check cache first
      if (isCacheValid(cacheKey)) {
        try {
          const cached = JSON.parse(localStorage.getItem(cacheKey)!);
          console.log('[UsageStats] Using cached data:', {
            statsLength: cached.stats?.length,
            totalUniqueUsers: cached.totalUniqueUsers,
            totalAttempts: cached.totalAttempts,
            cacheKey
          });
          setStatsData(cached.stats);
          setTotalUniqueUsers(cached.totalUniqueUsers || 0);
          setTotalAttempts(cached.totalAttempts || 0);
          setLoading(false);
          return;
        } catch (err) {
          console.warn('[UsageStats] Failed to parse cached data:', err);
        }
      }

      setLoading(true);
      setError(null);

      try {
        const result = await getUsageStatsCallable({ startDate, endDate });

        console.log('[UsageStats] Backend response:', {
          success: result.data.success,
          statsCount: result.data.stats?.length,
          totalUniqueUsers: result.data.totalUniqueUsers,
          totalAttempts: result.data.totalAttempts,
          count: result.data.count
        });

        if (result.data.success && result.data.stats) {
          const stats = result.data.stats;
          const uniqueUsers = result.data.totalUniqueUsers || 0;
          const attempts = result.data.totalAttempts || 0;

          console.log('[UsageStats] Setting state:', {
            statsLength: stats.length,
            uniqueUsers,
            attempts
          });

          setStatsData(stats);
          setTotalUniqueUsers(uniqueUsers);
          setTotalAttempts(attempts);

          // Cache the result
          localStorage.setItem(cacheKey, JSON.stringify({
            stats,
            totalUniqueUsers: uniqueUsers,
            totalAttempts: attempts,
            timestamp: Date.now(),
          }));
        } else {
          throw new Error(result.data.error || 'Failed to fetch usage stats');
        }
      } catch (err: any) {
        console.error('[UsageStats] Error fetching stats:', err);
        setError(err.message || 'An error occurred while fetching usage statistics');
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchStats();
    }
  }, [timeFilter, isAuthenticated]);

  // Aggregate data - monthly for "all time", daily for others
  const aggregatedData: AggregatedDataPoint[] = useMemo(() => {
    if (statsData.length === 0) return [];

    if (timeFilter === 'alltime') {
      // Aggregate by month - properly count unique users per month
      const monthlyMap = new Map<string, { userIds: Set<string>; totalAttempts: number }>();

      // DEBUG: Check if userIds exist in the data
      const sampleEntry = statsData[0];
      console.log('[UsageStats] Sample entry for debugging:', {
        puzzleId: sampleEntry?.puzzleId,
        uniqueUsers: sampleEntry?.uniqueUsers,
        hasUserIds: !!sampleEntry?.userIds,
        userIdsLength: sampleEntry?.userIds?.length,
        totalAttempts: sampleEntry?.totalAttempts
      });

      statsData.forEach(entry => {
        const monthKey = entry.puzzleId.substring(0, 7); // YYYY-MM
        const existing = monthlyMap.get(monthKey) || { userIds: new Set<string>(), totalAttempts: 0 };

        // Add user IDs to the set for this month (automatically deduplicates)
        if (entry.userIds && Array.isArray(entry.userIds)) {
          entry.userIds.forEach(uid => existing.userIds.add(uid));
        }

        existing.totalAttempts += entry.totalAttempts;
        monthlyMap.set(monthKey, existing);
      });

      // DEBUG: Log monthly aggregation results
      console.log('[UsageStats] Monthly aggregation:', Array.from(monthlyMap.entries()).map(([month, data]) => ({
        month,
        uniqueUsers: data.userIds.size,
        totalAttempts: data.totalAttempts
      })));

      return Array.from(monthlyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([monthKey, data]) => {
          const [year, month] = monthKey.split('-');
          const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short' });
          return {
            label: `${monthName} '${year.slice(2)}`,
            date: monthKey,
            uniqueUsers: data.userIds.size, // Count of unique users in the month
            totalAttempts: data.totalAttempts,
          };
        });
    }

    // Daily data for other filters
    return statsData.map(entry => {
      const date = new Date(entry.puzzleId + 'T00:00:00');
      return {
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        date: entry.puzzleId,
        uniqueUsers: entry.uniqueUsers,
        totalAttempts: entry.totalAttempts,
      };
    });
  }, [statsData, timeFilter]);

  // Calculate aggregate totals
  const totals = useMemo(() => {
    const dailyUsersSum = statsData.reduce((sum, d) => sum + d.uniqueUsers, 0);
    const avgUsersPerDay = statsData.length > 0 ? Math.round(dailyUsersSum / statsData.length) : 0;
    const avgAttemptsPerDay = statsData.length > 0 ? Math.round(totalAttempts / statsData.length) : 0;
    const peakDayUsers = statsData.length > 0
      ? statsData.reduce((max, d) => d.uniqueUsers > max.uniqueUsers ? d : max, statsData[0])
      : null;
    const peakDayAttempts = statsData.length > 0
      ? statsData.reduce((max, d) => d.totalAttempts > max.totalAttempts ? d : max, statsData[0])
      : null;

    return {
      totalUsers: totalUniqueUsers, // Use the actual unique users count from backend
      totalAttempts, // Use the total attempts from backend (from aggregate or sum of daily)
      avgUsersPerDay,
      avgAttemptsPerDay,
      peakDayUsers,
      peakDayAttempts,
      daysTracked: statsData.length
    };
  }, [statsData, totalUniqueUsers, totalAttempts]);

  const getChartValue = (point: AggregatedDataPoint) => {
    return metricType === 'users' ? point.uniqueUsers : point.totalAttempts;
  };

  const renderChart = () => {
    if (loading) {
      return (
        <div className="chart-placeholder">
          <FontAwesomeIcon icon={faSpinner} spin size="2x" />
          <p>Loading data...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="chart-placeholder error">
          <p>{error}</p>
        </div>
      );
    }

    if (aggregatedData.length === 0) {
      return (
        <div className="chart-placeholder">
          <p>No data available for this period.</p>
        </div>
      );
    }

    const maxValue = Math.max(...aggregatedData.map(getChartValue));
    const showEveryNth = aggregatedData.length > 15 ? Math.ceil(aggregatedData.length / 10) : 1;

    return (
      <div className="chart-area">
        <div className="chart-bars">
          {aggregatedData.map((point, index) => {
            const value = getChartValue(point);
            const heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
            const isLatest = index === aggregatedData.length - 1;
            const showLabel = index % showEveryNth === 0 || isLatest;

            return (
              <div key={point.date} className={`bar-column ${isLatest ? 'latest' : ''}`}>
                <div className="bar-tooltip">{value.toLocaleString()}</div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ height: `${Math.max(heightPercent, 3)}%` }} />
                </div>
                <span className={`bar-label ${showLabel ? '' : 'bar-label--hidden'}`}>{point.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const timeFilterLabels: Record<TimeFilter, string> = {
    '7days': '7D',
    '30days': '30D',
    '90days': '90D',
    'alltime': 'All',
  };

  return (
    <div className="usage-stats-screen">
      {/* Header */}
      <header className="screen-header">
        <h1>Analytics</h1>
      </header>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card featured">
          <div className="card-icon">
            <FontAwesomeIcon icon={faUsers} />
          </div>
          <div className="card-data">
            <span className="card-value">{totals.totalUsers.toLocaleString()}</span>
            <span className="card-label">Total Players</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">
            <FontAwesomeIcon icon={faGamepad} />
          </div>
          <div className="card-data">
            <span className="card-value">{totals.totalAttempts.toLocaleString()}</span>
            <span className="card-label">Total Attempts</span>
          </div>
        </div>
      </div>

      {/* Chart Panel */}
      <div className="chart-panel">
        {/* Controls Row */}
        <div className="chart-controls">
          <div className="time-toggles">
            {(Object.keys(timeFilterLabels) as TimeFilter[]).map(key => (
              <button
                key={key}
                className={timeFilter === key ? 'active' : ''}
                onClick={() => setTimeFilter(key)}
              >
                {timeFilterLabels[key]}
              </button>
            ))}
          </div>
          <div className="metric-toggles">
            <button
              className={metricType === 'users' ? 'active' : ''}
              onClick={() => setMetricType('users')}
            >
              <FontAwesomeIcon icon={faUsers} />
              <span>Users</span>
            </button>
            <button
              className={metricType === 'attempts' ? 'active' : ''}
              onClick={() => setMetricType('attempts')}
            >
              <FontAwesomeIcon icon={faGamepad} />
              <span>Attempts</span>
            </button>
          </div>
        </div>

        {/* Chart Title */}
        <div className="chart-title">
          <h2>
            {timeFilter === 'alltime' ? 'Monthly' : 'Daily'}{' '}
            {metricType === 'users' ? 'Active Users' : 'Puzzle Attempts'}
          </h2>
          <span className="chart-subtitle">
            {timeFilter === 'alltime' 
              ? `${aggregatedData.length} months` 
              : `${totals.daysTracked} days`}
          </span>
        </div>

        {/* Chart */}
        {renderChart()}
      </div>

      {/* Footer Stats */}
      <div className="footer-stats">
        <div className="footer-stat">
          <span className="footer-value">
            {metricType === 'users' 
              ? totals.avgUsersPerDay.toLocaleString() 
              : totals.avgAttemptsPerDay.toLocaleString()}
          </span>
          <span className="footer-label">
            {metricType === 'users' ? 'Avg Daily Users' : 'Avg Daily Attempts'}
          </span>
        </div>
        {(metricType === 'users' ? totals.peakDayUsers : totals.peakDayAttempts) && (
          <div className="footer-stat">
            <span className="footer-value">
              {metricType === 'users' 
                ? totals.peakDayUsers?.uniqueUsers.toLocaleString() 
                : totals.peakDayAttempts?.totalAttempts.toLocaleString()}
            </span>
            <span className="footer-label">
              {metricType === 'users' ? 'Peak Day Users' : 'Peak Day Attempts'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default UsageStatsScreen;
