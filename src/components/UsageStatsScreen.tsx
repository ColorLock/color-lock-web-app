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
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 90);
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

  // Fetch data when filter changes
  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);

      try {
        const { startDate, endDate } = getDateRange(timeFilter);
        const result = await getUsageStatsCallable({ startDate, endDate });

        if (result.data.success && result.data.stats) {
          setStatsData(result.data.stats);
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
      // Aggregate by month
      const monthlyMap = new Map<string, { uniqueUsers: number; totalAttempts: number }>();
      
      statsData.forEach(entry => {
        const monthKey = entry.puzzleId.substring(0, 7); // YYYY-MM
        const existing = monthlyMap.get(monthKey) || { uniqueUsers: 0, totalAttempts: 0 };
        monthlyMap.set(monthKey, {
          uniqueUsers: existing.uniqueUsers + entry.uniqueUsers,
          totalAttempts: existing.totalAttempts + entry.totalAttempts,
        });
      });

      return Array.from(monthlyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([monthKey, data]) => {
          const [year, month] = monthKey.split('-');
          const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short' });
          return {
            label: `${monthName} '${year.slice(2)}`,
            date: monthKey,
            uniqueUsers: data.uniqueUsers,
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
    const totalUsers = statsData.reduce((sum, d) => sum + d.uniqueUsers, 0);
    const totalAttempts = statsData.reduce((sum, d) => sum + d.totalAttempts, 0);
    const avgUsersPerDay = statsData.length > 0 ? Math.round(totalUsers / statsData.length) : 0;
    const avgAttemptsPerDay = statsData.length > 0 ? Math.round(totalAttempts / statsData.length) : 0;
    const peakDayUsers = statsData.length > 0 
      ? statsData.reduce((max, d) => d.uniqueUsers > max.uniqueUsers ? d : max, statsData[0])
      : null;
    const peakDayAttempts = statsData.length > 0 
      ? statsData.reduce((max, d) => d.totalAttempts > max.totalAttempts ? d : max, statsData[0])
      : null;

    return { 
      totalUsers, 
      totalAttempts, 
      avgUsersPerDay, 
      avgAttemptsPerDay, 
      peakDayUsers, 
      peakDayAttempts, 
      daysTracked: statsData.length 
    };
  }, [statsData]);

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
                {showLabel && <span className="bar-label">{point.label}</span>}
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
