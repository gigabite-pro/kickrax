import { useRef, Suspense, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

interface ShoeProps {
    mousePosition: { x: number; y: number };
    deviceOrientation: { beta: number; gamma: number } | null;
}

function Shoe({ mousePosition, deviceOrientation }: ShoeProps) {
    const { scene } = useGLTF("/models/scene.gltf");
    const meshRef = useRef<THREE.Group>(null);
    const { viewport } = useThree();

    // Enable shadows on all meshes in the model
    useEffect(() => {
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }, [scene]);

    // Target rotation based on mouse position or device orientation (inverted for opposite direction)
    const targetRotation = useRef({ x: 0, y: -5 });

    useFrame(() => {
        if (meshRef.current) {
            // Use device orientation on mobile, mouse position on desktop
            if (deviceOrientation) {
                // Device orientation: beta = front-to-back tilt, gamma = left-to-right tilt
                // Normalize to -1 to 1 range (beta: -45 to 45 degrees, gamma: -45 to 45 degrees)
                const normalizedX = Math.max(-1, Math.min(1, deviceOrientation.gamma / 45));
                const normalizedY = Math.max(-1, Math.min(1, (deviceOrientation.beta - 45) / 45));
                
                targetRotation.current.x = -normalizedY * 0.15;
                targetRotation.current.y = -normalizedX * 0.5;
            } else {
                // Calculate target rotation (opposite to mouse movement)
                // Reduced x-rotation to prevent clipping through shadow
                targetRotation.current.x = -mousePosition.y * 0.15;
                targetRotation.current.y = -mousePosition.x * 0.5;
            }

            // Smooth interpolation
            meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetRotation.current.x + 0.1, 0.05);
            meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetRotation.current.y - 1.0, 0.05);
        }
    });

    // Scale based on viewport: larger on desktop, bigger on mobile
    const getScale = () => {
        if (viewport.width > 8) return 11; // Large desktop
        if (viewport.width > 6) return 10; // Desktop
        if (viewport.width > 4) return 9;  // Tablet
        return 9; // Mobile - same as tablet for bigger appearance
    };

    // Position: centered on mobile, offset on desktop
    const getPosition = (): [number, number, number] => {
        if (viewport.width > 6) return [-0.3, -0.65, 0]; // Desktop - offset left
        return [0, -0.65, 0]; // Mobile/tablet - centered
    };

    return (
        <group ref={meshRef} scale={getScale()} position={getPosition()} rotation={[0.15, -3, 0]}>
            <primitive object={scene} />
        </group>
    );
}

interface ShoeModelProps {
    mousePosition: { x: number; y: number };
}

export default function ShoeModel({ mousePosition }: ShoeModelProps) {
    const [deviceOrientation, setDeviceOrientation] = useState<{ beta: number; gamma: number } | null>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const orientationHandlerRef = useRef<((event: DeviceOrientationEvent) => void) | null>(null);

    // Check if mobile on mount
    useEffect(() => {
        setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    }, []);

    // Set up orientation handler
    useEffect(() => {
        orientationHandlerRef.current = (event: DeviceOrientationEvent) => {
            if (event.beta !== null && event.gamma !== null) {
                setDeviceOrientation({
                    beta: event.beta,
                    gamma: event.gamma,
                });
            }
        };
    }, []);

    // Check if iOS needs permission
    const needsPermission = typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function';

    // Auto-enable motion for Android (no permission needed)
    useEffect(() => {
        if (!isMobile || needsPermission) return;
        
        // Android or older iOS - just add listener directly
        setPermissionGranted(true);
        if (orientationHandlerRef.current) {
            window.addEventListener('deviceorientation', orientationHandlerRef.current);
        }
        
        return () => {
            if (orientationHandlerRef.current) {
                window.removeEventListener('deviceorientation', orientationHandlerRef.current);
            }
        };
    }, [isMobile, needsPermission]);

    // Manual permission request for iOS (must be triggered by user gesture)
    const requestMotionPermission = async () => {
        try {
            const requestPermission = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
            if (requestPermission) {
                const permission = await requestPermission();
                if (permission === 'granted') {
                    setPermissionGranted(true);
                    if (orientationHandlerRef.current) {
                        window.addEventListener('deviceorientation', orientationHandlerRef.current);
                    }
                }
            }
        } catch (error) {
            console.log('Device orientation permission denied:', error);
        }
    };

    // Show tap button only on iOS that needs permission
    const showMotionButton = isMobile && needsPermission && !permissionGranted;

    return (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center">
            {/* Tap button for iOS to enable motion */}
            {showMotionButton && (
                <button
                    onClick={requestMotionPermission}
                    className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-noir/70 backdrop-blur-sm text-cotton text-xs px-4 py-2 rounded-full hover:bg-noir/90 transition-colors"
                >
                    Tap to enable motion
                </button>
            )}
            
            <Canvas shadows camera={{ position: [0, 0, 5], fov: 35 }} style={{ background: "transparent" }}>
                <ambientLight intensity={0.7} />
                {/* Main light from front-top to cast shadow behind */}
                <directionalLight
                    position={[0, 5, 10]}
                    intensity={1.5}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                    shadow-camera-far={50}
                    shadow-camera-left={-10}
                    shadow-camera-right={10}
                    shadow-camera-top={10}
                    shadow-camera-bottom={-10}
                />
                {/* Fill light from side */}
                <directionalLight position={[5, 3, 5]} intensity={0.6} />
                <directionalLight position={[-5, 3, 5]} intensity={0.4} />

                {/* Spotlight from front */}
                <spotLight position={[0, 5, 8]} intensity={0.8} angle={0.5} penumbra={1} castShadow />

                <Suspense fallback={null}>
                    <Shoe mousePosition={mousePosition} deviceOrientation={deviceOrientation} />
                    <ContactShadows position={[0, -0.9, 0]} opacity={0.4} scale={8} blur={2} far={2} color="#1b1717" />
                    <Environment preset="city" />
                </Suspense>
            </Canvas>
        </div>
    );
}

// Preload the model
useGLTF.preload("/models/scene.gltf");
