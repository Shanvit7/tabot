"use client";

import {
	Toaster as DingToaster,
	toast as dingToast,
} from "@yusufceng1z/ding-react";

type ToastType = Parameters<typeof dingToast.show>[0];
type ToastOptions = NonNullable<Parameters<typeof dingToast.show>[2]>;
type PromiseMessages<T> = Parameters<typeof dingToast.promise<T>>[1];

export { DingToaster };

const DEFAULT_TOAST_DURATION_MS = 6_000;
const withDuration = (options?: ToastOptions): ToastOptions => ({
	...options,
	duration: options?.duration ?? DEFAULT_TOAST_DURATION_MS,
});

const resolveMessage = <T>(
	message: string | ((value: T) => string),
	value: T,
): string => (typeof message === "function" ? message(value) : message);

export const toast = {
	...dingToast,
	show: (type: ToastType, title: string, options?: ToastOptions) =>
		dingToast.show(
			type,
			title,
			type === "loading" ? options : withDuration(options),
		),
	success: (title: string, options?: ToastOptions) =>
		dingToast.success(title, withDuration(options)),
	error: (title: string, options?: ToastOptions) =>
		dingToast.error(title, withDuration(options)),
	warning: (title: string, options?: ToastOptions) =>
		dingToast.warning(title, withDuration(options)),
	info: (title: string, options?: ToastOptions) =>
		dingToast.info(title, withDuration(options)),
	promise: async <T>(
		promise: Promise<T> | (() => Promise<T>),
		messages: PromiseMessages<T>,
	): Promise<T> => {
		const id = dingToast.loading(messages.loading);
		try {
			const result = await (typeof promise === "function"
				? promise()
				: promise);
			dingToast.update(id, {
				type: "success",
				title: resolveMessage(messages.success, result),
				duration: DEFAULT_TOAST_DURATION_MS,
			});
			return result;
		} catch (error) {
			dingToast.update(id, {
				type: "error",
				title: resolveMessage(messages.error, error),
				duration: DEFAULT_TOAST_DURATION_MS,
			});
			throw error;
		}
	},
};
