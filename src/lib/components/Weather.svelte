<script lang="ts">
	import { FlexWrapper, Icon, Loader, ToolTip } from "@davidnet/svelte-ui";
	import { onMount } from "svelte";
	import { writable } from "svelte/store";

	const weather = writable<any>(null);
	const loading = writable(true);

	let lat: number = $state(0);
	let lon: number = $state(0);

	async function fetchWeather() {
		if (lat == 0 || lon == 0) return;
		try {
			const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
			const data = await res.json();
			const instant = data.properties.timeseries[0].data.instant.details;
            console.log(instant);
			weather.set({
				temperature: instant.air_temperature,
				wind: instant.wind_speed,
                relative_humidity: instant.relative_humidity
			});
			loading.set(false);
		} catch (err) {
			console.error(err);
			loading.set(false);
		}
	}

	async function getIPLocation() {
		try {
			const res = await fetch("https://ipapi.co/json/");
			const data = await res.json();
			lat = data.latitude;
			lon = data.longitude;
			fetchWeather();
		} catch (err) {
			console.error(err);
			loading.set(false);
		}
	}
	onMount(() => {
		getIPLocation();
	});

	let hoveredc = $state(false);
    let hoveredhum = $state(false);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="weather-widget" Onmouseenter={() => (hoveredc = true)} Onmouseleave={() => (hoveredc = false)}>
	{#if $loading}
		<Loader/>
	{:else if $weather}
		{$weather.temperature}°C
	{:else}
		?°C
	{/if}
	{#if hoveredc}
		<ToolTip text={"TEMPERATURE - Location based on IP: LAT=" + lat + " LON=" + lon} />
	{/if}
</div>
-
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="weather-widget" Onmouseenter={() => (hoveredhum = true)} Onmouseleave={() => (hoveredhum = false)}>
	{#if $loading}
		<Loader/>
	{:else if $weather}
		{$weather.relative_humidity}%
	{:else}
		?°C
	{/if}
	{#if hoveredhum}
		<ToolTip text={"HUMIDITY - Location based on IP: LAT=" + lat + " LON=" + lon} />
	{/if}
</div>

<style>
	.weather-widget {
        display: inline-flex;
		border-radius: 1rem;
		display: inline-block;
		cursor: pointer;
        vertical-align: middle;
		position: relative;
	}
</style>
