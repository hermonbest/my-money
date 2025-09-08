import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { MaterialIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function StoreComparisonChart({ 
  data = [], 
  metric = 'revenue', 
  chartType = 'bar',
  onMetricChange 
}) {
  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="bar-chart" size={48} color="#d1d5db" />
        <Text style={styles.emptyText}>No data available for comparison</Text>
      </View>
    );
  }

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(55, 65, 81, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: '#2563eb',
    },
    propsForBackgroundLines: {
      strokeDasharray: '5,5',
      stroke: '#e5e7eb',
    },
  };

  const formatValue = (value) => {
    if (metric === 'revenue' || metric === 'profit' || metric === 'expenses' || metric === 'averageOrderValue') {
      return `$${value.toLocaleString()}`;
    }
    if (metric === 'profitMargin') {
      return `${value.toFixed(1)}%`;
    }
    return value.toLocaleString();
  };

  const getChartData = () => {
    const sortedData = [...data].sort((a, b) => b[metric] - a[metric]);
    
    if (chartType === 'pie') {
      return {
        labels: sortedData.map(store => store.name),
        datasets: [{
          data: sortedData.map(store => store[metric]),
          color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
          strokeWidth: 2,
        }]
      };
    }

    return {
      labels: sortedData.map(store => store.name.length > 8 ? 
        store.name.substring(0, 8) + '...' : store.name),
      datasets: [{
        data: sortedData.map(store => store[metric]),
        color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
        strokeWidth: 2,
      }]
    };
  };

  const renderChart = () => {
    const chartData = getChartData();
    const chartWidth = width - 40;

    switch (chartType) {
      case 'line':
        return (
          <LineChart
            data={chartData}
            width={chartWidth}
            height={220}
            chartConfig={chartConfig}
            bezier
            style={styles.chart}
            withDots={true}
            withShadow={false}
            withInnerLines={true}
            withOuterLines={true}
          />
        );
      
      case 'pie':
        return (
          <PieChart
            data={chartData.datasets[0].data.map((value, index) => ({
              name: chartData.labels[index],
              population: value,
              color: chartData.datasets[0].color(0.7 + (index * 0.1)),
              legendFontColor: '#374151',
              legendFontSize: 12,
            }))}
            width={chartWidth}
            height={220}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            style={styles.chart}
          />
        );
      
      default: // bar
        return (
          <BarChart
            data={chartData}
            width={chartWidth}
            height={220}
            chartConfig={chartConfig}
            style={styles.chart}
            withInnerLines={true}
            showValuesOnTopOfBars={true}
            fromZero={true}
          />
        );
    }
  };

  const getMetricLabel = () => {
    switch (metric) {
      case 'revenue':
        return 'Revenue';
      case 'profit':
        return 'Profit';
      case 'expenses':
        return 'Expenses';
      case 'profitMargin':
        return 'Profit Margin';
      case 'salesCount':
        return 'Sales Count';
      case 'averageOrderValue':
        return 'Average Order Value';
      default:
        return 'Revenue';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Store Comparison</Text>
        <Text style={styles.subtitle}>{getMetricLabel()}</Text>
      </View>
      
      {renderChart()}
      
      <View style={styles.legend}>
        {data.map((store, index) => (
          <View key={store.id} style={styles.legendItem}>
            <View 
              style={[
                styles.legendColor, 
                { backgroundColor: store.color || '#2563eb' }
              ]} 
            />
            <Text style={styles.legendText}>
              {store.name}: {formatValue(store[metric])}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  legend: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  emptyContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 40,
    marginVertical: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 12,
    textAlign: 'center',
  },
});
