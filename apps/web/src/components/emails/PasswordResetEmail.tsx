import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from "@react-email/components";
import * as React from "react";

interface PasswordResetEmailProps {
    resetLink: string;
}

export const PasswordResetEmail = ({
    resetLink,
}: PasswordResetEmailProps) => {
    return (
        <Html>
            <Head />
            <Preview>Reset your PlacementRanker password</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={header}>
                        <Heading style={heading}>PlacementRanker</Heading>
                    </Section>
                    
                    <Section style={bodySection}>
                        <Heading style={h2}>Reset Password Request</Heading>
                        <Text style={text}>
                            We received a request to reset your password for your PlacementRanker account. 
                            If you didn&apos;t make this request, you can safely ignore this email.
                        </Text>
                        
                        <Section style={buttonContainer}>
                            <Button style={button} href={resetLink}>
                                Reset Your Password
                            </Button>
                        </Section>
                        
                        <Text style={text}>
                            Or copy and paste this URL into your browser:
                            <br />
                            <Link href={resetLink} style={link}>
                                {resetLink}
                            </Link>
                        </Text>
                    </Section>

                    <Hr style={hr} />
                    <Section style={footer}>
                        <Text style={footerText}>
                            &copy; {new Date().getFullYear()} PlacementRanker. All rights reserved.
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
};

// Styles
const main = {
    backgroundColor: "#f3f4f6",
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
    padding: "40px 0",
};

const container = {
    margin: "0 auto",
    width: "100%",
    maxWidth: "600px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
};

const header = {
    backgroundColor: "#0ea5e9", // primary-500
    padding: "32px 40px",
    textAlign: "center" as const,
};

const heading = {
    color: "#ffffff",
    fontSize: "28px",
    fontWeight: "bold",
    margin: "0",
    letterSpacing: "1px",
};

const bodySection = {
    padding: "40px",
};

const h2 = {
    color: "#111827",
    fontSize: "20px",
    fontWeight: "600",
    margin: "0 0 20px",
};

const text = {
    color: "#4b5563",
    fontSize: "16px",
    lineHeight: "24px",
    margin: "0 0 24px",
};

const buttonContainer = {
    textAlign: "center" as const,
    margin: "32px 0",
};

const button = {
    backgroundColor: "#0ea5e9", // primary-500
    borderRadius: "8px",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "600",
    textDecoration: "none",
    textAlign: "center" as const,
    display: "inline-block",
    padding: "14px 32px",
};

const link = {
    color: "#0ea5e9",
    textDecoration: "underline",
    wordBreak: "break-all" as const,
};

const hr = {
    borderColor: "#e5e7eb",
    margin: "0",
};

const footer = {
    backgroundColor: "#f9fafb",
    padding: "24px 40px",
    textAlign: "center" as const,
};

const footerText = {
    color: "#9ca3af",
    fontSize: "14px",
    margin: "0",
};

export default PasswordResetEmail;
