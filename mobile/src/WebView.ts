import { WebView as RNWebView } from "react-native-webview";

/**
 * react-native-webview 14 declares `class WebView<P = undefined> extends
 * Component<WebViewProps & P>`; TypeScript 6 reduces `WebViewProps & undefined`
 * to `never`, rejecting every prop. Pin P to an empty object.
 */
export const WebView = RNWebView as unknown as typeof RNWebView<object>;
export type WebViewHandle = RNWebView<object>;
export type { WebViewMessageEvent } from "react-native-webview";
