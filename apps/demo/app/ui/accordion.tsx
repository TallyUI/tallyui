import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Text,
  VStack,
} from '@tallyui/components';

export default function AccordionScreen() {
  const [controlledValue, setControlledValue] = useState('section-1');

  return (
    <>
      <Stack.Screen options={{ title: 'Accordion' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Single Collapsible</Text>
          <Text className="text-sm text-muted-foreground">
            Only one section open at a time. Click the active trigger to collapse it.
          </Text>
          <Accordion type="single" defaultValue="item-1" collapsible>
            <AccordionItem value="item-1">
              <AccordionTrigger>
                <Text>Is it accessible?</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>
                  Yes. The accordion follows WAI-ARIA patterns and works with screen readers.
                </Text>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>
                <Text>Is it styled?</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>
                  Yes. It ships with default NativeWind styles that you can override with className.
                </Text>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>
                <Text>Is it animated?</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>
                  Yes. The content area uses CSS transitions on web for smooth expand and collapse.
                </Text>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Multiple Open</Text>
          <Text className="text-sm text-muted-foreground">
            Several sections can be open at the same time.
          </Text>
          <Accordion type="multiple" defaultValue={['faq-1', 'faq-3']}>
            <AccordionItem value="faq-1">
              <AccordionTrigger>
                <Text>How do I install?</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>Run npm install @tallyui/components in your project.</Text>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-2">
              <AccordionTrigger>
                <Text>Does it support React Native?</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>Yes, all components work on iOS, Android, and web.</Text>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="faq-3">
              <AccordionTrigger>
                <Text>Can I customize styles?</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>
                  Pass className to any sub-component. The cn() utility merges your classes with the
                  defaults.
                </Text>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Controlled</Text>
          <Text className="text-sm text-muted-foreground">
            Open section: {controlledValue || 'none'}
          </Text>
          <Accordion
            type="single"
            value={controlledValue}
            onValueChange={setControlledValue}
            collapsible
          >
            <AccordionItem value="section-1">
              <AccordionTrigger>
                <Text>Section 1</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>
                  This accordion is controlled. The parent component manages which section is open.
                </Text>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="section-2">
              <AccordionTrigger>
                <Text>Section 2</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>
                  Changing the value prop programmatically will open this section.
                </Text>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="section-3">
              <AccordionTrigger>
                <Text>Section 3</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>
                  The onValueChange callback fires whenever the user opens or closes a section.
                </Text>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Non-collapsible</Text>
          <Text className="text-sm text-muted-foreground">
            One section must always stay open.
          </Text>
          <Accordion type="single" defaultValue="always-1">
            <AccordionItem value="always-1">
              <AccordionTrigger>
                <Text>Always one open</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>
                  Without the collapsible prop, clicking the active trigger won't close it.
                </Text>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="always-2">
              <AccordionTrigger>
                <Text>Click to switch</Text>
              </AccordionTrigger>
              <AccordionContent>
                <Text>Clicking another trigger will swap which section is shown.</Text>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </VStack>
      </ScrollView>
    </>
  );
}
