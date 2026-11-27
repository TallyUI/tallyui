// Port of WCPOS v2 (monorepo main) screens/main/customers/index.tsx and row.tsx: the Customers screen's search and list; MIT, WCPOS.
import type * as React from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { Customer } from '@tallyui/core';
import { cn } from '@tallyui/theme';
import { useT } from '../i18n';
import { Avatar, avatarInitials } from '../ui/avatar';
import { Button } from '../ui/button';
import { ChevronRightIcon } from '../ui/icon/chevron-right-icon';
import { Input } from '../ui/input';
import { ListRow } from '../ui/list-row';
import { Loader } from '../ui/loader';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';

// v2's syncing row count (data-table/index.tsx:204).
const SYNCING_SKELETON_ROWS = 5;

export interface CustomersListProps {
  /** The rows, in the order the app's search returned them. */
  customers: Customer[];
  /** The search field's text. */
  query: string;
  /** Every edit of the search field, and `''` from Clear search. */
  onQueryChange: (query: string) => void;
  /** Absent: rows are not pressable and show no chevron (v2 without canEditCustomers). */
  onOpen?: (customer: Customer) => void;
  /** Called when the list scrolls within a tenth of its visible height of the end, as CustomerDropdown does. */
  onEndReached?: () => void;
  /** With no rows and a blank query, draws skeleton rows; otherwise a loading row under the rows. */
  loading?: boolean;
  /** A sentence the app wants shown above the rows (a failed search). */
  error?: string;
  /** Before the search field, e.g. an Add button the app gates. */
  actions?: React.ReactNode;
  className?: string;
  /** Default `customers-list`; rows are `${testID}-row-${id}`. */
  testID?: string;
}

/** v2's Customers screen list: a search field, then one row per customer, drawn from props. The app owns the search,
 * paging, the route and the editor. */
export function CustomersList({ customers, query, onQueryChange, onOpen, onEndReached, loading = false, error, actions, className, testID = 'customers-list' }: CustomersListProps) {
  const t = useT();
  // v2's onEndReachedThreshold={0.1}, CustomerDropdown's own test (customer-dropdown.tsx:113-116).
  const onScroll = ({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (contentSize.height - (contentOffset.y + layoutMeasurement.height) <= 0.1 * layoutMeasurement.height) onEndReached?.();
  };
  const empty = !customers.length && !loading;
  const blank = query.trim() === '';

  return <View className={cn('flex-1', className)} testID={testID}>
    <View className="flex-row items-center gap-2 p-2">
      {actions}
      <Input className="flex-1"><Input.Field accessibilityLabel={t('common.search_customers')} placeholder={t('common.search_customers')}
        testID={`${testID}-search`} value={query} onChangeText={onQueryChange} /></Input>
    </View>
    {error ? <Text role="alert" testID={`${testID}-error`} className="px-3 py-2 text-sm text-destructive">{error}</Text> : null}
    <ScrollView testID={`${testID}-scroll`} onScroll={onScroll} scrollEventThrottle={16}>
      {customers.map((customer) => {
        const location = [customer.billing?.city, customer.billing?.country].filter(Boolean).join(', ');
        return <ListRow key={customer.id} testID={`${testID}-row-${customer.id}`}
          onPress={onOpen ? () => onOpen(customer) : undefined}
          accessibilityLabel={onOpen ? `${t('customers.open_customer')}: ${customer.name}` : undefined}
          leading={<Avatar tone="primary" fallback={avatarInitials(customer.name)} aria-hidden />}
          trailing={<>
            <Text numberOfLines={1} className="max-w-1/3 text-sm text-muted-foreground">{location}</Text>
            {onOpen ? <View className="text-muted-foreground"><ChevronRightIcon size={16} /></View> : null}
          </>}>
          <Text numberOfLines={1}>{customer.name}</Text>
          {customer.email ? <Text numberOfLines={1} className="text-sm text-muted-foreground">{customer.email}</Text> : null}
        </ListRow>;
      })}
      {loading && customers.length === 0 && blank ? <View testID={`${testID}-skeleton`}
        accessibilityLabel={t('customers.loading_customers')} aria-busy className="gap-1 px-3">
        {Array.from({ length: SYNCING_SKELETON_ROWS }, (_, index) => <Skeleton key={index} shape="row" testID={`${testID}-skeleton-row`} />)}
      </View> : loading ? <View testID={`${testID}-loading`} className="items-center py-4"><Loader /></View> : null}
      {empty && blank ? <View testID={`${testID}-empty`} className="items-center gap-1 p-6">
        <Text role="heading" className="font-medium">{t('customers.no_customers_yet')}</Text>
        <Text className="text-center text-sm text-muted-foreground">{t('customers.no_customers_yet_description')}</Text>
      </View> : null}
      {empty && !blank ? <View testID={`${testID}-no-results`} className="items-center gap-2 p-6">
        <Text role="heading" className="font-medium">{t('customers.nothing_matches_search')}</Text>
        <Button variant="outline" size="sm" testID={`${testID}-clear-search`} onPress={() => onQueryChange('')}>
          <Text>{t('customers.clear_search')}</Text>
        </Button>
      </View> : null}
    </ScrollView>
  </View>;
}
