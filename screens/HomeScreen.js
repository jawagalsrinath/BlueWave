import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Dimensions, PermissionsAndroid, Platform, ActivityIndicator } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { BleManager } from 'react-native-ble-plx';

const manager = new BleManager();

export default function HomeScreen() {
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [data, setData] = useState([]);  // For graph data
  const [sensorValue, setSensorValue] = useState(null);  // For displaying the single data value
  const [isConnected, setIsConnected] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        if (Object.values(granted).every(status => status === PermissionsAndroid.RESULTS.GRANTED)) {
          startScan();
        } else {
          Alert.alert('Permission Denied', 'You need to grant Bluetooth permissions to use this app.');
        }
      } else {
        startScan();
      }
    };

    requestPermissions();
  }, []);

  const startScan = () => {
    setScanning(true);
    console.log('Starting device scan');
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('Scan error:', error);
        setScanning(false);
        return;
      }

      if (device && device.name && device.id) {
        setDevices((prevDevices) => {
          const deviceExists = prevDevices.some((d) => d.id === device.id);
          if (!deviceExists) {
            return [...prevDevices, device];
          }
          return prevDevices;
        });
      }
    });

    // Stop scanning after a timeout
    setTimeout(() => {
      setScanning(false);
      manager.stopDeviceScan();
      if (devices.length === 0) {
        Alert.alert('No Devices Found', 'No Bluetooth devices were found. Please make sure your device is turned on and in range.');
      }
    }, 15000); // Stop scanning after 15 seconds
  };

  const connectToDevice = (device) => {
    manager.stopDeviceScan(); // Stop scanning when a device is selected
    device.connect()
      .then((device) => {
        console.log('Connected to', device.name);
        setConnectedDevice(device);
        setIsConnected(true);
        return device.discoverAllServicesAndCharacteristics();
      })
      .then((device) => {
        discoverAndMonitor(device);
      })
      .catch((error) => {
        console.error('Connection error:', error);
        Alert.alert('Error', `Failed to connect: ${error.message}`);
        setIsConnected(false);
        startScan(); // Continue scanning after the error
      });
  };

  const discoverAndMonitor = (device) => {
    let dataReceived = false;

    device.services().then((services) => {
      services.forEach((service) => {
        service.characteristics().then((characteristics) => {
          characteristics.forEach((characteristic) => {
            if (characteristic.isNotifiable) {
              characteristic.monitor((error, characteristic) => {
                if (error) {
                  console.error('Monitor error:', error);
                  return;
                }

                dataReceived = true;
                const value = parseInt(characteristic.value, 10);
                handleNewValue(value);
              });
            }
          });
        });
      });
    }).catch(error => {
      console.error('Service discovery error:', error);
    });

    setTimeout(() => {
      if (!dataReceived) {
        Alert.alert('No Data', 'This device is not sending any data. Returning to device list.');
        setIsConnected(false);
        setConnectedDevice(null);
        startScan(); // Restart scanning
      }
    }, 5000); // Wait 5 seconds to check if data was received
  };

  const handleNewValue = (value) => {
    setSensorValue(value);
    setData((prevData) => [...prevData, value]);
  };

  const renderDeviceItem = ({ item }) => (
    <TouchableOpacity style={styles.deviceItem} onPress={() => connectToDevice(item)}>
      <Text>{item.name}</Text>
      <Text>{item.id}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Available Devices</Text>
      {scanning ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={renderDeviceItem}
          ListEmptyComponent={<Text>No devices found. Please scan again.</Text>}
        />
      )}
      {isConnected && (
        <>
          <Text style={styles.headerText}>Sensor Data Visualization</Text>
          <LineChart
            data={{ datasets: [{ data }] }}
            width={Dimensions.get('window').width - 40}
            height={220}
            chartConfig={{
              backgroundColor: '#000',
              backgroundGradientFrom: '#1E2923',
              backgroundGradientTo: '#08130D',
              color: (opacity = 1) => `rgba(26, 255, 146, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: { r: '6', strokeWidth: '2', stroke: '#ffa726' },
            }}
            bezier
            style={{ marginVertical: 8, borderRadius: 16 }}
          />
          <Text style={styles.sensorValueText}>{sensorValue}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5', justifyContent: 'center' },
  headerText: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  sensorValueText: { fontSize: 48, fontWeight: 'bold', color: '#333', textAlign: 'center', marginTop: 20 },
  deviceItem: { padding: 10, marginVertical: 5, backgroundColor: '#ddd', borderRadius: 5, alignItems: 'center' },
});

