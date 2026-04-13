pub fn is_service_row(value: &str) -> bool {
    let normalized = value.trim().to_lowercase();
    if normalized.is_empty() {
        return false;
    }

    const MARKERS: [&str; 10] = [
        "примеч",
        "подпись",
        "подпис",
        "ответственный",
        "итого",
        "комментар",
        "заключение",
        "проектные параметры",
        "служебная информация",
        "габаритные размеры",
    ];

    MARKERS.iter().any(|marker| normalized.contains(marker))
}
