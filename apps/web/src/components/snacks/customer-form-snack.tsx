'use client';

import { ExpoSnack } from '../expo-snack';
import { createPropsSnackFiles, propsSnackDependencies } from './snack-wrapper';

const demoCode = `import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { CustomerForm } from '@tallyui/components';

export default function Demo() {
  const [values, setValues] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
  });

  const handleChange = (field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>New Customer</Text>
      <CustomerForm
        values={values}
        onChangeField={handleChange}
        onSubmit={() => alert('Saved: ' + values.firstName + ' ' + values.lastName)}
        submitLabel="Save Customer"
      />
      <View style={styles.output}>
        <Text style={styles.label}>Form state:</Text>
        <Text style={styles.value}>{JSON.stringify(values, null, 2)}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { gap: 12, paddingBottom: 24 },
  heading: { fontSize: 16, fontWeight: '700', color: '#111827', paddingHorizontal: 16, paddingTop: 16 },
  output: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginHorizontal: 16, gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
  value: { fontSize: 11, color: '#374151', fontFamily: 'monospace' },
});`;

export function CustomerFormDemo() {
  return (
    <ExpoSnack
      files={createPropsSnackFiles(demoCode)}
      dependencies={propsSnackDependencies}
      name="CustomerForm"
      platform="web"
      preview={true}
      height="500px"
    />
  );
}
