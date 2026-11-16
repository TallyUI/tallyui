/**
 * The extension contract version a manifest declares as `apiVersion` (ADR-089). Experimental: before
 * this package reaches 1.0 the host accepts only this exact version; the "current and previous
 * version" window begins at 1.0.
 */
export const EXTENSION_API_VERSION = 1;
export { TARGET_IDS, CAPABILITIES } from './types';
export type { TargetId, Capability, ReadView, SaleView, SaleActions, SaleSource, TargetSources, TargetBlockProps, TargetContribution, ExtensionManifest, RefusalReason, ExtensionRefusal, TargetEntry, ExtensionHost, CreateExtensionHostOptions, ExtensionTargetProps, SaleLike } from './types';
export { defineExtension, createExtensionHost } from './host';
export { ExtensionHostProvider, useExtensionHost, ExtensionTarget, useReadView } from './react';
export { useSaleSource } from './sale-source';
