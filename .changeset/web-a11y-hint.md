---
'@tallyui/components': patch
---

On web, the disabled New coupon button's reason and each order row's hint now reach assistive technology through `aria-describedby`, since react-native-web drops `accessibilityHint`.
