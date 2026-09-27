import { View } from 'react-native';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { RegisterBar, Text } from '@tallyui/components';
import { openSession, startCounting } from '@tallyui/pos';
import { useDemoRegister, type DemoRegisterDb } from '../../../lib/use-demo-register';

/**
 * Every pill state `describeRegisterBarPill` can return (register-bar.helpers.ts), keyed by a
 * short slug for the URL and the screenshot filenames the Front desk reviews the copy from.
 */
const STATES = ['choose', 'offline', 'approval', 'counting', 'overdue', 'closed', 'none'] as const;
type BarState = (typeof STATES)[number];

function isBarState(value: unknown): value is BarState {
  return typeof value === 'string' && (STATES as readonly string[]).includes(value);
}

/**
 * Seeds the session each state needs. `approval_required` has no writer yet in TallyUI (a
 * manager-approval flow, WCPOS LEDGER 61, is a later job) — this patches the field directly on
 * the session document, the way that later job's writer eventually will, purely to render the
 * pill for review.
 */
function seedFor(state: BarState) {
  return async (db: DemoRegisterDb) => {
    if (state === 'choose' || state === 'closed') return; // no session: unbound, or sessions never opened
    const session = await openSession(db.register_sessions, {
      registerId: 'demo-register', expectedFloatMinor: 20000, countedFloatMinor: 20000,
      openedBy: 'demo-cashier', businessDay: { year: 2026, month: 9, day: 20 },
    });
    if (state === 'counting') await startCounting(db.register_sessions, session.id);
    if (state === 'approval') {
      await db.register_sessions.findOne(session.id).incrementalPatch({ approval_required: true });
    }
  };
}

export default function RegisterBarScreen() {
  const { state: param } = useLocalSearchParams<{ state?: string }>();
  const state: BarState = isBarState(param) ? param : 'none';
  const registerId = state === 'choose' ? null : 'demo-register';
  const online = state !== 'offline';
  const expectedCloseTime = state === 'overdue' ? '00:00' : undefined;
  const { register, ready } = useDemoRegister({ registerId, expectedCloseTime, seed: seedFor(state) });
  return (
    <>
      <Stack.Screen options={{ title: 'RegisterBar' }} />
      <View className="flex-1 bg-background" testID="register-bar-screen">
        {ready && (
          <RegisterBar
            register={register}
            registerId={registerId}
            online={online}
            registerName="Front counter"
            multiRegister
            onOpenPanel={() => {}}
          />
        )}
        <View className="p-4 gap-2">
          <Text testID="register-bar-state" className="text-muted-foreground text-sm">
            state={state}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {STATES.map((s) => (
              <Link key={s} href={{ pathname: '/pos/register/bar', params: { state: s } }}>
                <Text className="text-primary underline">{s}</Text>
              </Link>
            ))}
          </View>
        </View>
      </View>
    </>
  );
}
