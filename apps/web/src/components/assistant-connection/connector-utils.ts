export const focusConnectorsHeading = (heading: HTMLHeadingElement | null) => {
	if (!heading || window.location.hash !== "#connectors-heading") return;
	heading.scrollIntoView();
	heading.focus({ preventScroll: true });
};
