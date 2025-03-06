async function loadDropdownOptions() {
  try {
    const response = await fetch("https://script.google.com/macros/s/YOUR_DEPLOYED_URL/exec");
    const data = await response.json();
    fillDropdowns(data);
  } catch (error) {
    console.error("Error fetching dropdown options:", error);
  }
}
